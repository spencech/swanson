import WebSocket, { WebSocketServer } from "ws";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import http from "http";
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import { classify } from "./classifier";
import { ExpertPool } from "./expert-pool";
import { ConsultationBroker } from "./consultation-broker";
import { ConversationLogger } from "./logger";
import { parseMessage, createAgentRequest, extractMessageText } from "./protocol";
import { ExpertName, ExpertResponse, EXPERTS } from "./types";

const CLIENT_TOKEN = process.env.OPENCLAW_CLIENT_TOKEN || "swanson-dev-token";
const INTERNAL_TOKEN = process.env.OPENCLAW_INTERNAL_TOKEN || "expert-internal-token";
const PORT = parseInt(process.env.GATEWAY_PORT || "18790", 10);

const EXPERT_TIMEOUT_MS = 120000;

const expertPool = new ExpertPool(INTERNAL_TOKEN);
const broker = new ConsultationBroker(expertPool);

let synthesisClient: Anthropic | null = null;
function getSynthesisClient(): Anthropic {
	if (!synthesisClient) {
		synthesisClient = new Anthropic();
	}
	return synthesisClient;
}

// ─── Express HTTP server for consultation API ────────────────────────────────

const app = express();
app.use(express.json());

app.post("/consult", async (req, res) => {
	const { fromExpert, toExpert, question, priority, mode, parentRequestId, depth } = req.body;

	try {
		if (mode === "sync") {
			const result = await broker.submitSync(fromExpert, toExpert, question, priority || "normal", parentRequestId, depth || 0);
			res.json(result);
		} else {
			const result = await broker.submitAsync(fromExpert, toExpert, question, priority || "normal", parentRequestId, depth || 0);
			res.json(result);
		}
	} catch (err) {
		const status = (err as Error).message.includes("Circular") || (err as Error).message.includes("Max consultation") ? 400
			: (err as Error).message.includes("busy") || (err as Error).message.includes("Too many") ? 429
			: 500;
		res.status(status).json({ error: (err as Error).message });
	}
});

// Static routes MUST be before parameterized :requestId route
app.get("/consult/health", (_req, res) => {
	res.json(broker.getHealth());
});

app.get("/consult/sessions", async (_req, res) => {
	const stats: Record<string, unknown> = {};
	for (const expert of EXPERTS) {
		try {
			const result = await expertPool.querySessionStats(expert);
			stats[expert] = result;
		} catch {
			stats[expert] = { error: "unreachable" };
		}
	}
	res.json(stats);
});

app.get("/consult/:requestId", (req, res) => {
	const result = broker.getStatus(req.params.requestId);
	if (!result) {
		res.status(404).json({ error: "Request not found" });
		return;
	}
	res.json(result);
});

app.delete("/consult/:requestId", (req, res) => {
	const success = broker.cancel(req.params.requestId);
	res.json({ cancelled: success });
});

// ─── WebSocket proxy server ─────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs: WebSocket) => {
	console.log("[gateway] New client connection");

	let authenticated = false;
	let logger: ConversationLogger | null = null;

	// Send connect challenge (OpenClaw protocol format)
	clientWs.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: { challenge: "swanson-gateway" } }));

	clientWs.on("message", async (raw) => {
		const data = raw.toString();
		const msg = parseMessage(data);

		if (!msg) {
			console.warn("[gateway] Unparseable message from client");
			return;
		}

		// Handle authentication — accept both OpenClaw protocol and legacy format
		const isOpenClawConnect = msg.type === "req" && (msg as { method?: string }).method === "connect";
		const isLegacyConnect = msg.type === "connect.auth";

		if (isOpenClawConnect || isLegacyConnect) {
			let token: string | undefined;
			const reqId = (msg as { id?: string }).id;

			if (isOpenClawConnect) {
				const params = (msg as { params?: { auth?: { token?: string } } }).params;
				token = params?.auth?.token;
			} else {
				token = (msg as { token?: string }).token;
			}

			if (token === CLIENT_TOKEN) {
				authenticated = true;
				// Reply in OpenClaw protocol format
				clientWs.send(JSON.stringify({ type: "res", id: reqId, ok: true, payload: { type: "hello-ok" } }));
				console.log("[gateway] Client authenticated");
			} else {
				clientWs.send(JSON.stringify({ type: "res", id: reqId, ok: false, error: { code: "AUTH_FAILED", message: "Invalid token" } }));
				clientWs.close();
			}
			return;
		}

		if (!authenticated) {
			clientWs.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
			return;
		}

		// Handle agent requests — accept both OpenClaw protocol and legacy format
		const isOpenClawAgent = msg.type === "req" && (msg as { method?: string }).method === "agent";
		const isLegacyAgent = msg.type === "agent.request";

		if (isOpenClawAgent || isLegacyAgent) {
			const reqId = (msg as { id?: string }).id;
			let messageText: string | null = null;
			let clientSessionKey: string | null = null;

			if (isOpenClawAgent) {
				const params = (msg as { params?: { message?: string; sessionKey?: string } }).params;
				messageText = params?.message || null;
				clientSessionKey = params?.sessionKey || null;
			} else {
				messageText = extractMessageText(msg);
			}

			if (!messageText) {
				clientWs.send(JSON.stringify({ type: "res", id: reqId, ok: false, error: { code: "BAD_REQUEST", message: "No message text in request" } }));
				return;
			}

			const startTime = Date.now();
			const sessionKey = clientSessionKey || "main";

			// Classify the message
			const classification = await classify(messageText);
			const primaryExpert = classification.primary as ExpertName;
			const supportingExperts = classification.supporting.filter(s => EXPERTS.includes(s as ExpertName)) as ExpertName[];
			const isMultiExpert = supportingExperts.length > 0;

			console.log(`[gateway] Classified → primary=${primaryExpert}, supporting=[${supportingExperts.join(",")}] (confidence: ${classification.confidence}, session: ${sessionKey})`);

			// Send routing announcement to client
			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.send(JSON.stringify({
					type: "event",
					event: "routing",
					payload: {
						mode: isMultiExpert ? "multi" : "single",
						primary: primaryExpert,
						supporting: supportingExperts,
						confidence: classification.confidence,
						reason: classification.reason,
					},
				}));
			}

			// Create logger
			const requestLogger = new ConversationLogger(primaryExpert);
			logger = requestLogger;
			for (const s of supportingExperts) requestLogger.addExpert(s);
			requestLogger.log({
				ts: new Date().toISOString(),
				type: "classify",
				from: "chris",
				to: primaryExpert,
				confidence: classification.confidence,
				reason: classification.reason,
			});
			requestLogger.log({
				ts: new Date().toISOString(),
				type: "request",
				from: "client",
				to: primaryExpert,
				message: messageText.substring(0, 500),
			});

			if (isMultiExpert) {
				await handleMultiExpert(clientWs, reqId, messageText, sessionKey, primaryExpert, supportingExperts, classification.focus, requestLogger, startTime);
			} else {
				await handleSingleExpert(clientWs, reqId, messageText, sessionKey, primaryExpert, requestLogger, startTime);
			}

			return;
		}

		// Forward any other messages to the active expert connection
		console.log(`[gateway] Unhandled message type: ${msg.type}`);
	});

	clientWs.on("close", () => {
		console.log("[gateway] Client disconnected");
	});

	clientWs.on("error", (err) => {
		console.error("[gateway] Client WS error:", err.message);
	});
});

// ─── Single Expert Handler (unchanged behavior) ────────────────────────────

async function handleSingleExpert(
	clientWs: WebSocket,
	reqId: string | undefined,
	messageText: string,
	sessionKey: string,
	expert: ExpertName,
	requestLogger: ConversationLogger,
	startTime: number,
): Promise<void> {
	try {
		let turnCount = 0;
		let responseText = "";

		const expertWs = await expertPool.connectToExpert(
			expert,
			(expertData: string) => {
				const expertMsg = parseMessage(expertData);
				if (!expertMsg) return;

				const isAgentEvent = expertMsg.type === "event" && (expertMsg as { event?: string }).event === "agent";

				if (isAgentEvent) {
					const payload = (expertMsg as { payload?: { data?: { phase?: string; delta?: string }; stream?: string } }).payload;
					if (payload?.data?.phase) {
						requestLogger.log({
							ts: new Date().toISOString(),
							type: "event",
							from: expert,
							phase: payload.data.phase,
						});
					}

					if (payload?.stream === "assistant") {
						turnCount++;
						if (payload?.data?.delta) {
							responseText += payload.data.delta;
						}
					} else if (payload?.data?.phase === "start") {
						turnCount++;
					}

					if (clientWs.readyState === WebSocket.OPEN) {
						const forwarded = JSON.parse(expertData);
						forwarded.expert = expert;
						clientWs.send(JSON.stringify(forwarded));
					}
					return;
				}

				if (expertMsg.type === "res") {
					const payload = (expertMsg as { payload?: { status?: string } }).payload;
					const isAcceptance = payload?.status === "accepted";

					if (isAcceptance) {
						console.log(`[gateway] Agent request accepted by ${expert}`);
						return;
					}

					const duration = Date.now() - startTime;
					console.log(`[gateway] Request complete: expert=${expert}, session=${sessionKey}, turns=${turnCount}, duration=${duration}ms`);

					if (sessionKey !== "main" && responseText.length > 0) {
						writeTurnLog(sessionKey, expert, messageText, responseText);
					}
					requestLogger.log({
						ts: new Date().toISOString(),
						type: "response",
						from: expert,
						duration_ms: duration,
						turns: turnCount,
						session: sessionKey,
					});

					if (clientWs.readyState === WebSocket.OPEN) {
						clientWs.send(JSON.stringify({
							type: "res",
							id: reqId,
							ok: (expertMsg as { ok?: boolean }).ok,
							payload: payload || { status: "ok" },
							expert,
						}));
					}

					setTimeout(() => expertWs.close(), 100);
					return;
				}

				if (clientWs.readyState === WebSocket.OPEN) {
					clientWs.send(expertData);
				}
			},
			() => {
				console.log(`[gateway] Expert ${expert} connection closed`);
			},
			(err: Error) => {
				console.error(`[gateway] Expert ${expert} error:`, err.message);
				if (clientWs.readyState === WebSocket.OPEN) {
					clientWs.send(JSON.stringify({
						type: "res",
						id: reqId,
						ok: false,
						error: { code: "EXPERT_ERROR", message: `Expert ${expert} encountered an error: ${err.message}` },
					}));
				}
			},
		);

		let enrichedMessage = messageText;
		if (sessionKey !== "main") {
			const contextHint = getThreadHint(sessionKey);
			if (contextHint) {
				enrichedMessage = `${contextHint}\n\n${messageText}`;
			}
		}

		const internalReq = createAgentRequest(enrichedMessage, sessionKey);
		expertWs.send(internalReq);
	} catch (err) {
		console.error(`[gateway] Failed to connect to expert ${expert}:`, (err as Error).message);
		requestLogger.log({
			ts: new Date().toISOString(),
			type: "error",
			from: "chris",
			to: expert,
			error: (err as Error).message,
		});
		clientWs.send(JSON.stringify({
			type: "res",
			id: reqId,
			ok: false,
			error: { code: "EXPERT_UNAVAILABLE", message: `Failed to reach expert ${expert}: ${(err as Error).message}` },
		}));
	}
}

// ─── Multi Expert Fan-Out Handler ───────────────────────────────────────────

async function handleMultiExpert(
	clientWs: WebSocket,
	reqId: string | undefined,
	messageText: string,
	sessionKey: string,
	primaryExpert: ExpertName,
	supportingExperts: ExpertName[],
	focus: Record<string, string> | undefined,
	requestLogger: ConversationLogger,
	startTime: number,
): Promise<void> {
	const allExperts = [primaryExpert, ...supportingExperts];

	// Send fanout.start event
	if (clientWs.readyState === WebSocket.OPEN) {
		clientWs.send(JSON.stringify({
			type: "event",
			event: "fanout.start",
			payload: { experts: allExperts },
		}));
	}

	// Build thread context hint
	let contextHint = "";
	if (sessionKey !== "main") {
		contextHint = getThreadHint(sessionKey);
	}

	// Fan out to all experts in parallel
	let completedCount = 0;
	const total = allExperts.length;

	const results = await Promise.allSettled(
		allExperts.map(expert => {
			const brief = buildExpertBrief(expert, allExperts, focus, messageText, contextHint);
			return fanOutToExpert(expert, brief, sessionKey, requestLogger, (status: string) => {
				// Progress callback
				if (status === "complete" || status === "failed") completedCount++;
				if (clientWs.readyState === WebSocket.OPEN) {
					clientWs.send(JSON.stringify({
						type: "event",
						event: "fanout.progress",
						payload: { expert, status, total, completed: completedCount },
					}));
				}
			});
		}),
	);

	// Collect responses
	const expertResponses: ExpertResponse[] = results.map((r, i) => {
		if (r.status === "fulfilled") return r.value;
		return {
			expert: allExperts[i],
			status: "failed" as const,
			responseText: "",
			startedAt: startTime,
			error: r.reason?.message || "Unknown error",
		};
	});

	const succeeded = expertResponses.filter(r => r.status === "complete" && r.responseText.length > 0);
	const primaryResponse = expertResponses.find(r => r.expert === primaryExpert);

	console.log(`[gateway] Fan-out complete: ${succeeded.length}/${total} succeeded`);

	// Determine what to do with the results
	if (succeeded.length === 0) {
		// All experts failed
		if (clientWs.readyState === WebSocket.OPEN) {
			clientWs.send(JSON.stringify({
				type: "res",
				id: reqId,
				ok: false,
				error: { code: "ALL_EXPERTS_FAILED", message: "All consulted experts failed to respond" },
			}));
		}
		return;
	}

	if (succeeded.length === 1) {
		// Only one succeeded — stream raw response, skip synthesis
		const solo = succeeded[0];
		console.log(`[gateway] Only ${solo.expert} succeeded — streaming raw response (no synthesis)`);
		streamRawResponse(clientWs, reqId, solo.expert, solo.responseText);

		if (sessionKey !== "main") {
			writeTurnLog(sessionKey, solo.expert, messageText, solo.responseText);
		}
		requestLogger.log({
			ts: new Date().toISOString(),
			type: "response",
			from: solo.expert,
			duration_ms: Date.now() - startTime,
			session: sessionKey,
		});
		return;
	}

	// Multiple experts succeeded — synthesize
	if (clientWs.readyState === WebSocket.OPEN) {
		clientWs.send(JSON.stringify({
			type: "event",
			event: "fanout.synthesizing",
			payload: {},
		}));
	}

	try {
		const synthesizedText = await synthesizeAndStream(clientWs, primaryExpert, succeeded, messageText);

		// Write turn logs for each expert + synthesis
		if (sessionKey !== "main") {
			for (const r of succeeded) {
				writeTurnLog(sessionKey, r.expert, messageText, r.responseText);
			}
			writeTurnLog(sessionKey, "chris-synthesis", messageText, synthesizedText);
		}

		for (const r of succeeded) {
			requestLogger.log({
				ts: new Date().toISOString(),
				type: "response",
				from: r.expert,
				duration_ms: (r.completedAt || Date.now()) - r.startedAt,
				session: sessionKey,
			});
		}
		requestLogger.log({
			ts: new Date().toISOString(),
			type: "response",
			from: "chris",
			message: "synthesis",
			duration_ms: Date.now() - startTime,
			session: sessionKey,
		});

		// Send final response
		if (clientWs.readyState === WebSocket.OPEN) {
			clientWs.send(JSON.stringify({
				type: "res",
				id: reqId,
				ok: true,
				payload: { status: "ok" },
				expert: "chris",
			}));
		}
	} catch (err) {
		console.error(`[gateway] Synthesis failed:`, (err as Error).message);

		// Fall back to primary expert's raw response
		if (primaryResponse && primaryResponse.status === "complete" && primaryResponse.responseText.length > 0) {
			console.log(`[gateway] Falling back to primary expert's raw response`);
			streamRawResponse(clientWs, reqId, primaryExpert, primaryResponse.responseText);
		} else {
			// Use first successful response
			const fallback = succeeded[0];
			streamRawResponse(clientWs, reqId, fallback.expert, fallback.responseText);
		}

		if (sessionKey !== "main") {
			for (const r of succeeded) {
				writeTurnLog(sessionKey, r.expert, messageText, r.responseText);
			}
		}
	}
}

// ─── Expert Brief Builder ───────────────────────────────────────────────────

function buildExpertBrief(
	expert: ExpertName,
	allExperts: ExpertName[],
	focus: Record<string, string> | undefined,
	originalQuestion: string,
	contextHint: string,
): string {
	const others = allExperts.filter(e => e !== expert);
	const focusDirective = focus?.[expert] || "";

	let brief = "";
	if (contextHint) brief += `${contextHint}\n\n`;

	brief += `[Multi-expert task — coordinated by Chris]\n`;
	brief += `User's question: ${originalQuestion}\n\n`;

	if (focusDirective) {
		brief += `Your role: ${focusDirective}\n`;
	}

	if (others.length > 0) {
		brief += `Also working on this:\n`;
		for (const other of others) {
			const otherFocus = focus?.[other] || "their domain expertise";
			brief += `  - ${other}: ${otherFocus}\n`;
		}
	}

	brief += `\nChris will synthesize all responses into one answer. Focus on YOUR domain.`;
	return brief;
}

// ─── Fan Out to Individual Expert ───────────────────────────────────────────

function fanOutToExpert(
	expert: ExpertName,
	brief: string,
	sessionKey: string,
	requestLogger: ConversationLogger,
	onProgress: (status: string) => void,
): Promise<ExpertResponse> {
	return new Promise((resolve) => {
		const result: ExpertResponse = {
			expert,
			status: "pending",
			responseText: "",
			startedAt: Date.now(),
		};

		const timeout = setTimeout(() => {
			if (result.status !== "complete") {
				console.warn(`[gateway] Expert ${expert} timed out after ${EXPERT_TIMEOUT_MS}ms`);
				result.status = "failed";
				result.error = "Timeout";
				result.completedAt = Date.now();
				onProgress("failed");
				resolve(result);
			}
		}, EXPERT_TIMEOUT_MS);

		expertPool.connectToExpert(
			expert,
			(expertData: string) => {
				const expertMsg = parseMessage(expertData);
				if (!expertMsg) return;

				const isAgentEvent = expertMsg.type === "event" && (expertMsg as { event?: string }).event === "agent";

				if (isAgentEvent) {
					const payload = (expertMsg as { payload?: { data?: { phase?: string; delta?: string }; stream?: string } }).payload;

					if (payload?.stream === "assistant" && payload?.data?.delta) {
						if (result.status === "pending") {
							result.status = "streaming";
							onProgress("streaming");
						}
						result.responseText += payload.data.delta;
					}

					if (payload?.data?.phase) {
						requestLogger.log({
							ts: new Date().toISOString(),
							type: "event",
							from: expert,
							phase: payload.data.phase,
						});
					}
					return;
				}

				if (expertMsg.type === "res") {
					const payload = (expertMsg as { payload?: { status?: string } }).payload;
					if (payload?.status === "accepted") {
						console.log(`[gateway] Fan-out: ${expert} accepted`);
						return;
					}

					// Final response
					clearTimeout(timeout);
					result.status = "complete";
					result.completedAt = Date.now();
					console.log(`[gateway] Fan-out: ${expert} complete (${result.responseText.length} chars, ${result.completedAt - result.startedAt}ms)`);
					onProgress("complete");
					resolve(result);
				}
			},
			() => {
				clearTimeout(timeout);
				if (result.status !== "complete") {
					result.status = "failed";
					result.error = "Connection closed";
					result.completedAt = Date.now();
					onProgress("failed");
					resolve(result);
				}
			},
			(err: Error) => {
				clearTimeout(timeout);
				result.status = "failed";
				result.error = err.message;
				result.completedAt = Date.now();
				onProgress("failed");
				resolve(result);
			},
		).then((expertWs) => {
			const internalReq = createAgentRequest(brief, sessionKey);
			expertWs.send(internalReq);
		}).catch((err) => {
			clearTimeout(timeout);
			result.status = "failed";
			result.error = (err as Error).message;
			result.completedAt = Date.now();
			onProgress("failed");
			resolve(result);
		});
	});
}

// ─── Synthesis via Haiku Streaming ──────────────────────────────────────────

async function synthesizeAndStream(
	clientWs: WebSocket,
	primaryExpert: ExpertName,
	responses: ExpertResponse[],
	originalQuestion: string,
): Promise<string> {
	const client = getSynthesisClient();

	// Build the synthesis prompt
	let expertInputs = "";
	for (const r of responses) {
		const isPrimary = r.expert === primaryExpert ? " (PRIMARY)" : "";
		expertInputs += `\n--- ${r.expert}${isPrimary} ---\n${r.responseText}\n`;
	}

	const systemPrompt = `You are synthesizing responses from multiple domain experts into one unified answer for the user.

Rules:
- Use the PRIMARY expert's response as the backbone/structure of your answer.
- Weave in supporting expert perspectives naturally — don't create separate sections per expert.
- Preserve ALL data, numbers, citations, and specific facts exactly as provided.
- If experts provide complementary information, merge it seamlessly.
- If experts contradict each other, note the discrepancy.
- Do NOT add information beyond what the experts provided.
- Do NOT mention "experts" or "synthesis" — write as if you are one knowledgeable assistant.
- Match the tone and formatting style of the primary expert's response.`;

	const userMessage = `User's original question: ${originalQuestion}

Expert responses:
${expertInputs}

Synthesize these into one cohesive response.`;

	let synthesizedText = "";

	const stream = client.messages.stream({
		model: "claude-haiku-4-5-20251001",
		max_tokens: 4096,
		system: systemPrompt,
		messages: [{ role: "user", content: userMessage }],
	});

	// Send lifecycle start
	if (clientWs.readyState === WebSocket.OPEN) {
		clientWs.send(JSON.stringify({
			type: "event",
			event: "agent",
			payload: { stream: "lifecycle", data: { phase: "start" } },
			expert: "chris",
		}));
	}

	for await (const event of stream) {
		if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
			const delta = event.delta.text;
			synthesizedText += delta;

			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.send(JSON.stringify({
					type: "event",
					event: "agent",
					payload: { stream: "assistant", data: { delta } },
					expert: "chris",
				}));
			}
		}
	}

	// Send lifecycle end
	if (clientWs.readyState === WebSocket.OPEN) {
		clientWs.send(JSON.stringify({
			type: "event",
			event: "agent",
			payload: { stream: "lifecycle", data: { phase: "end" } },
			expert: "chris",
		}));
	}

	return synthesizedText;
}

// ─── Raw Response Streamer (single-expert fallback) ─────────────────────────

function streamRawResponse(
	clientWs: WebSocket,
	reqId: string | undefined,
	expert: ExpertName | string,
	responseText: string,
): void {
	if (clientWs.readyState !== WebSocket.OPEN) return;

	// Send lifecycle start
	clientWs.send(JSON.stringify({
		type: "event",
		event: "agent",
		payload: { stream: "lifecycle", data: { phase: "start" } },
		expert,
	}));

	// Send the full text as one delta
	clientWs.send(JSON.stringify({
		type: "event",
		event: "agent",
		payload: { stream: "assistant", data: { delta: responseText } },
		expert,
	}));

	// Send lifecycle end
	clientWs.send(JSON.stringify({
		type: "event",
		event: "agent",
		payload: { stream: "lifecycle", data: { phase: "end" } },
		expert,
	}));

	// Send final response
	clientWs.send(JSON.stringify({
		type: "res",
		id: reqId,
		ok: true,
		payload: { status: "ok" },
		expert,
	}));
}

// ─── Thread turn log helpers ────────────────────────────────────────────────

const THREADS_DIR = "/workspace/threads";

function writeTurnLog(threadId: string, expert: string, question: string, response: string): void {
	try {
		const threadDir = path.join(THREADS_DIR, threadId);
		mkdirSync(threadDir, { recursive: true });

		// Determine sequence number from existing turns
		const turnsPath = path.join(threadDir, "turns.jsonl");
		let seq = 1;
		if (existsSync(turnsPath)) {
			const lines = readFileSync(turnsPath, "utf8").trim().split("\n").filter(Boolean);
			seq = lines.length + 1;
		}

		// Write full response to separate file
		const responseFile = `turn-${String(seq).padStart(3, "0")}-${expert}.md`;
		writeFileSync(path.join(threadDir, responseFile), response, "utf8");

		// Append metadata to turns.jsonl
		const entry = JSON.stringify({
			seq,
			ts: new Date().toISOString(),
			expert,
			question: question.slice(0, 500),
			responsePath: responseFile,
			responseLen: response.length,
		});
		appendFileSync(turnsPath, entry + "\n", "utf8");
		console.log(`[gateway] Turn log written: ${threadDir}/${responseFile} (${response.length} chars)`);
	} catch (err) {
		console.error(`[gateway] Failed to write turn log for thread ${threadId}:`, (err as Error).message);
	}
}

function getThreadHint(threadId: string): string {
	try {
		const turnsPath = path.join(THREADS_DIR, threadId, "turns.jsonl");
		if (!existsSync(turnsPath)) return "";

		const lines = readFileSync(turnsPath, "utf8").trim().split("\n").filter(Boolean);
		if (lines.length === 0) return "";

		const experts = lines.map(l => {
			try { return JSON.parse(l).expert; } catch { return "unknown"; }
		});
		const summary = experts.join(", ");

		return `[Thread context: ${lines.length} prior turn(s) by ${summary}. Log: /workspace/threads/${threadId}/turns.jsonl]`;
	} catch {
		return "";
	}
}

// ─── Start server ───────────────────────────────────────────────────────────

server.listen(PORT, "0.0.0.0", () => {
	console.log(`[gateway] Chris Traeger is LITERALLY running on port ${PORT}`);
	console.log(`[gateway] Experts: ${EXPERTS.join(", ")}`);
	console.log(`[gateway] Consultation API: http://0.0.0.0:${PORT}/consult`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
	console.log("[gateway] Shutting down...");
	broker.destroy();
	expertPool.closeAll();
	wss.close();
	server.close();
	process.exit(0);
});
