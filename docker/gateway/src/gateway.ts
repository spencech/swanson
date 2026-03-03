import WebSocket, { WebSocketServer } from "ws";
import express from "express";
import http from "http";
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

// Health route MUST be before parameterized :requestId route
app.get("/consult/health", (_req, res) => {
	res.json(broker.getHealth());
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

	// Send connect challenge
	clientWs.send(JSON.stringify({ type: "connect.challenge", challenge: "swanson-gateway" }));

	clientWs.on("message", async (raw) => {
		const data = raw.toString();
		const msg = parseMessage(data);

		if (!msg) {
			console.warn("[gateway] Unparseable message from client");
			return;
		}

		// Handle authentication
		if (msg.type === "connect.auth") {
			const token = (msg as { token?: string }).token;
			if (token === CLIENT_TOKEN) {
				authenticated = true;
				clientWs.send(JSON.stringify({ type: "connect.result", status: "ok" }));
				console.log("[gateway] Client authenticated");
			} else {
				clientWs.send(JSON.stringify({ type: "connect.result", status: "error", error: "Invalid token" }));
				clientWs.close();
			}
			return;
		}

		if (!authenticated) {
			clientWs.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
			return;
		}

		// Handle agent requests — classify and route
		if (msg.type === "agent.request") {
			const messageText = extractMessageText(msg);
			if (!messageText) {
				clientWs.send(JSON.stringify({ type: "error", message: "No message text in request" }));
				return;
			}

			const startTime = Date.now();

			// Classify the message
			const classification = await classify(messageText);
			const expert = classification.expert as ExpertName;

			console.log(`[gateway] Classified → ${expert} (confidence: ${classification.confidence}, reason: ${classification.reason})`);

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
				// Connect to expert and proxy
				const expertWs = await expertPool.connectToExpert(
					expert,
					(expertData: string) => {
						// Proxy expert messages to client
						const expertMsg = parseMessage(expertData);
						if (expertMsg) {
							// Log events
							if (expertMsg.type === "agent.event") {
								const payload = (expertMsg as { payload?: { data?: { phase?: string; delta?: string } } }).payload;
								if (payload?.data?.phase) {
									requestLogger.log({
										ts: new Date().toISOString(),
										type: "event",
										from: expert,
										phase: payload.data.phase,
									});
								}
							}

							if (expertMsg.type === "agent.response") {
								requestLogger.log({
									ts: new Date().toISOString(),
									type: "response",
									from: expert,
									duration_ms: Date.now() - startTime,
								});
								// Close expert WS after response to free pool slot
								setTimeout(() => expertWs.close(), 100);
							}
						}

						// Forward to client as-is
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
								type: "agent.response",
								error: `Expert ${expert} encountered an error: ${err.message}`,
							}));
						}
					},
				);

				// Forward the original request to the expert
				expertWs.send(data);
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
					type: "agent.response",
					error: `Failed to reach expert ${expert}: ${(err as Error).message}`,
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
