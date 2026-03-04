import WebSocket, { WebSocketServer } from "ws";
import express from "express";
import http from "http";
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import { classify } from "./classifier";
import { ExpertPool } from "./expert-pool";
import { ConsultationBroker } from "./consultation-broker";
import { ConversationLogger } from "./logger";
import { parseMessage, createAgentRequest, extractMessageText } from "./protocol";
import { ExpertName, EXPERTS } from "./types";

const CLIENT_TOKEN = process.env.OPENCLAW_CLIENT_TOKEN || "swanson-dev-token";
const INTERNAL_TOKEN = process.env.OPENCLAW_INTERNAL_TOKEN || "expert-internal-token";
const PORT = parseInt(process.env.GATEWAY_PORT || "18790", 10);

const expertPool = new ExpertPool(INTERNAL_TOKEN);
const broker = new ConsultationBroker(expertPool);

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

			// Classify the message
			const classification = await classify(messageText);
			const expert = classification.expert as ExpertName;

			const sessionKey = clientSessionKey || "main";
			console.log(`[gateway] Classified → ${expert} (confidence: ${classification.confidence}, session: ${sessionKey})`);

			// Send routing announcement to client before connecting to expert
			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.send(JSON.stringify({
					type: "event",
					event: "routing",
					payload: { expert, confidence: classification.confidence, reason: classification.reason },
				}));
			}

			// Create logger (capture as const so closures reference this request's logger)
			const requestLogger = new ConversationLogger(expert);
			logger = requestLogger;
			requestLogger.log({
				ts: new Date().toISOString(),
				type: "classify",
				from: "chris",
				to: expert,
				confidence: classification.confidence,
				reason: classification.reason,
			});
			requestLogger.log({
				ts: new Date().toISOString(),
				type: "request",
				from: "client",
				to: expert,
				message: messageText.substring(0, 500),
			});

			try {
				let turnCount = 0;
				let responseText = "";

				// Connect to expert and proxy
				const expertWs = await expertPool.connectToExpert(
					expert,
					(expertData: string) => {
						// Proxy expert messages to client in OpenClaw protocol format
						const expertMsg = parseMessage(expertData);
						if (!expertMsg) return;

						// Agent events — experts send {type:"event", event:"agent", payload:{...}}
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

							// Count assistant turns and accumulate response text
							if (payload?.stream === "assistant") {
								turnCount++;
								if (payload?.data?.delta) {
									responseText += payload.data.delta;
								}
							} else if (payload?.data?.phase === "start") {
								turnCount++;
							}

							// Forward with expert identity stamped
							if (clientWs.readyState === WebSocket.OPEN) {
								const forwarded = JSON.parse(expertData);
								forwarded.expert = expert;
								clientWs.send(JSON.stringify(forwarded));
							}
							return;
						}

						// Agent responses — experts send {type:"res", id:"...", ok:..., payload:{...}}
						if (expertMsg.type === "res") {
							const payload = (expertMsg as { payload?: { status?: string } }).payload;
							const isAcceptance = payload?.status === "accepted";

							if (isAcceptance) {
								// Just an ack — agent is starting work. Keep connection open.
								console.log(`[gateway] Agent request accepted by ${expert}`);
								return;
							}

							// Final response (completed or error) — forward to client and close
							const duration = Date.now() - startTime;
							console.log(`[gateway] Request complete: expert=${expert}, session=${sessionKey}, turns=${turnCount}, duration=${duration}ms`);

							// Write turn log for cross-expert thread context
							if (sessionKey !== "main" && responseText.length > 0) {
								writeTurnLog(sessionKey, expert, messageText!, responseText);
							}
							requestLogger.log({
								ts: new Date().toISOString(),
								type: "response",
								from: expert,
								duration_ms: duration,
								turns: turnCount,
								session: sessionKey,
							});

							// Re-stamp with the client's request ID and expert identity
							if (clientWs.readyState === WebSocket.OPEN) {
								clientWs.send(JSON.stringify({
									type: "res",
									id: reqId,
									ok: (expertMsg as { ok?: boolean }).ok,
									payload: payload || { status: "ok" },
									expert,
								}));
							}

							// Close expert WS after final response to free pool slot
							setTimeout(() => expertWs.close(), 100);
							return;
						}

						// Forward any other expert messages as-is
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

				// Prepend thread context hint if prior turns exist
				let enrichedMessage = messageText;
				if (sessionKey !== "main") {
					const contextHint = getThreadHint(sessionKey);
					if (contextHint) {
						enrichedMessage = `${contextHint}\n\n${messageText}`;
					}
				}

				// Forward the request to the expert in the internal protocol format
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
