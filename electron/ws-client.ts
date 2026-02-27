import { BrowserWindow } from "electron";
import crypto from "crypto";
import WebSocket from "ws";
import type {
	IWSMessage,
	IChatPayload,
	WSMessageType,
} from "../shared/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OpenClawClientConfig {
	serverUrl: string;
	token: string;
	userEmail: string;
}

type ConnectionState = "disconnected" | "connected" | "reconnecting";

interface PendingRequest {
	resolve: (payload: unknown) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

// ─── OpenClaw WebSocket Client ──────────────────────────────────────────────────

let config: OpenClawClientConfig | null = null;
let connectionState: ConnectionState = "disconnected";
let ws: WebSocket | null = null;
let pendingSocket: WebSocket | null = null; // tracks socket during async handshake
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let mainWindowRef: BrowserWindow | null = null;
let chatRunning = false;
let currentMessageId: string | null = null;
let fullContent = "";

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

// Pending request/response tracking (keyed by request id)
const pendingRequests = new Map<string, PendingRequest>();

// Session key for OpenClaw (determines which session the agent uses)
let sessionKey = "main";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getWsUrl(): string | null {
	if (!config) return null;
	try {
		const url = new URL(config.serverUrl);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		url.pathname = "/ws";
		return url.toString();
	} catch {
		return null;
	}
}

function sendFrame(frame: Record<string, unknown>): void {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(frame));
	}
}

function sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const id = crypto.randomUUID();
		const timer = setTimeout(() => {
			pendingRequests.delete(id);
			reject(new Error(`Request ${method} timed out`));
		}, REQUEST_TIMEOUT_MS);

		pendingRequests.set(id, { resolve, reject, timer });
		sendFrame({ type: "req", id, method, params });
	});
}

function sendToRenderer(type: WSMessageType, payload: unknown): void {
	if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
	const message: IWSMessage = {
		type,
		sessionId: sessionKey,
		payload,
		timestamp: new Date().toISOString(),
	};
	mainWindowRef.webContents.send("openclaw-message", message);
}

// ─── WebSocket Message Handler ──────────────────────────────────────────────────

function handleMessage(raw: WebSocket.Data): void {
	let msg: Record<string, unknown>;
	try {
		msg = JSON.parse(raw.toString());
	} catch {
		return;
	}

	const msgType = msg.type as string;

	// ── Response to a pending request ──
	if (msgType === "res" && typeof msg.id === "string") {
		const pending = pendingRequests.get(msg.id);
		if (pending) {
			clearTimeout(pending.timer);
			pendingRequests.delete(msg.id);
			if (msg.ok) {
				pending.resolve(msg.payload);
			} else {
				pending.reject(new Error(JSON.stringify(msg.error || "Unknown error")));
			}
			return;
		}

		// Handle agent final response (not in pendingRequests since sendFrame was used)
		if (msg.id === currentMessageId && msg.ok) {
			const payload = msg.payload as Record<string, unknown>;
			if (payload?.status === "ok" && chatRunning) {
				const result = payload.result as Record<string, unknown> | undefined;
				const payloads = result?.payloads as Array<Record<string, unknown>> | undefined;
				if (payloads?.length) {
					const text = payloads.map(p => (p.text as string) || "").join("\n");
					if (text && !fullContent) {
						// Streaming didn't deliver content — use final response as fallback
						fullContent = text;
					}
				}
				sendToRenderer("chat", {
					content: fullContent,
					delta: false,
					done: true,
					messageId: currentMessageId,
				} as IChatPayload);
				chatRunning = false;
				currentMessageId = null;
				fullContent = "";
			}
		}
		return;
	}

	// ── Server-push events ──
	if (msgType === "event") {
		const event = msg.event as string;
		const payload = msg.payload as Record<string, unknown> | undefined;

		// Connect challenge — respond with auth
		if (event === "connect.challenge") {
			handleConnectChallenge(payload);
			return;
		}

		// Agent streaming events
		if (event === "agent" && payload) {
			handleAgentEvent(payload);
			return;
		}

		// Session lifecycle events
		if (event === "session.start" || event === "session.end") {
			return; // Handled implicitly by agent events
		}
	}
}

function handleConnectChallenge(payload: Record<string, unknown> | undefined): void {
	if (!config) return;

	// Operator role with token auth can skip device identity entirely
	// (roleCanSkipDeviceIdentity returns true for operator + sharedAuthOk)
	// Omitting device avoids the signature validation path.
	sendFrame({
		type: "req",
		id: crypto.randomUUID(),
		method: "connect",
		params: {
			minProtocol: 3,
			maxProtocol: 3,
			client: {
				id: "cli",
				version: "1.0.0",
				platform: process.platform,
				mode: "cli",
			},
			role: "operator",
			scopes: ["operator.read", "operator.write"],
			auth: {
				token: config.token,
			},
		},
	});
}

function handleAgentEvent(payload: Record<string, unknown>): void {
	const stream = payload.stream as string;
	const data = payload.data as Record<string, unknown> | undefined;
	const delta = data?.delta as string | undefined;
	const phase = data?.phase as string | undefined;

	// Lifecycle events
	if (stream === "lifecycle") {
		if (phase === "start") {
			// Agent run started — send initial chat indicator if we haven't already
			return;
		}
		if (phase === "end" || phase === "error") {
			// Agent run finished — mark stream done
			// (final res handler will also fire and deliver any content missed by streaming)
			if (chatRunning && currentMessageId) {
				sendToRenderer("chat", {
					content: fullContent,
					delta: false,
					done: true,
					messageId: currentMessageId,
				} as IChatPayload);
				chatRunning = false;
				currentMessageId = null;
				fullContent = "";
			}
			if (phase === "error") {
				const errorMsg = (data?.error as string) || "Agent run failed";
				sendToRenderer("error", { code: "AGENT_ERROR", message: errorMsg });
			}
			return;
		}
	}

	// Assistant text deltas
	if (stream === "assistant" && delta && currentMessageId) {
		fullContent += delta;
		sendToRenderer("chat", {
			content: delta,
			delta: true,
			done: false,
			messageId: currentMessageId,
		} as IChatPayload);
		return;
	}

	// Tool events — could forward to renderer for tool-use UI
	if (stream === "tool") {
		return; // Silently consume for now
	}
}

// ─── Connection Management ─────────────────────────────────────────────────────

export function configure(serverUrl: string, token: string, userEmail: string): void {
	config = { serverUrl, token, userEmail };
	sessionKey = `swanson-${userEmail.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

export async function connect(): Promise<{ success: boolean; error?: string }> {
	if (!config) {
		return { success: false, error: "Client not configured. Set server URL and token first." };
	}

	const wsUrl = getWsUrl();
	if (!wsUrl) {
		return { success: false, error: "Invalid server URL" };
	}

	// Close existing connection if any (including mid-handshake sockets)
	if (pendingSocket) {
		pendingSocket.removeAllListeners();
		pendingSocket.close();
		pendingSocket = null;
	}
	if (ws) {
		ws.removeAllListeners();
		ws.close();
		ws = null;
	}

	return new Promise((resolve) => {
		const socket = new WebSocket(wsUrl);
		pendingSocket = socket;

		let connected = false;
		let connectTimeout: ReturnType<typeof setTimeout> | null = null;

		// Wait for hello-ok response to confirm connection
		const onFirstMessage = (raw: WebSocket.Data): void => {
			let msg: Record<string, unknown>;
			try {
				msg = JSON.parse(raw.toString());
			} catch {
				return;
			}

			// Challenge event — handle it (sends connect request)
			if (msg.type === "event" && msg.event === "connect.challenge") {
				handleConnectChallenge(msg.payload as Record<string, unknown>);
				return;
			}

			// Hello-ok response — connection established
			if (msg.type === "res" && msg.ok === true) {
				const payload = msg.payload as Record<string, unknown> | undefined;
				if (payload?.type === "hello-ok") {
					connected = true;
					connectionState = "connected";
					reconnectAttempts = 0;
					if (connectTimeout) clearTimeout(connectTimeout);

					// Switch to normal message handler
					socket.removeListener("message", onFirstMessage);
					socket.on("message", handleMessage);

					resolve({ success: true });
					return;
				}
			}

			// Auth failure
			if (msg.type === "res" && msg.ok === false) {
				if (connectTimeout) clearTimeout(connectTimeout);
				socket.close();
				ws = null;
				pendingSocket = null;
				connectionState = "disconnected";
				const errMsg = JSON.stringify((msg as Record<string, unknown>).error || "Authentication failed");
				resolve({ success: false, error: errMsg });
			}
		};

		socket.on("message", onFirstMessage);

		socket.on("open", () => {
			ws = socket;
			pendingSocket = null;
			// Challenge will arrive as first message — handled by onFirstMessage
		});

		socket.on("close", () => {
			if (connected) {
				connectionState = "disconnected";
				sendToRenderer("status", { state: "disconnected", message: "Connection closed" });
				if (mainWindowRef) scheduleReconnect();
			}
		});

		socket.on("error", (err) => {
			if (!connected) {
				if (connectTimeout) clearTimeout(connectTimeout);
				pendingSocket = null;
				connectionState = "disconnected";
				resolve({ success: false, error: `WebSocket error: ${err.message}` });
			} else {
				sendToRenderer("error", { code: "WS_ERROR", message: err.message });
			}
		});

		// Timeout if handshake doesn't complete
		connectTimeout = setTimeout(() => {
			if (!connected) {
				socket.close();
				ws = null;
				pendingSocket = null;
				connectionState = "disconnected";
				resolve({ success: false, error: "Connection handshake timed out" });
			}
		}, 10000);
	});
}

export function disconnect(): void {
	if (pendingSocket) {
		pendingSocket.removeAllListeners();
		pendingSocket.close();
		pendingSocket = null;
	}
	if (ws) {
		ws.removeAllListeners();
		ws.close();
		ws = null;
	}
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	connectionState = "disconnected";
	reconnectAttempts = 0;
	chatRunning = false;
	currentMessageId = null;
	fullContent = "";

	// Clear pending requests
	for (const [id, pending] of pendingRequests) {
		clearTimeout(pending.timer);
		pending.reject(new Error("Disconnected"));
	}
	pendingRequests.clear();
}

export function getConnectionState(): ConnectionState {
	return connectionState;
}

export function getSessionId(): string {
	return sessionKey;
}

// ─── Auto-Reconnect ────────────────────────────────────────────────────────────

function scheduleReconnect(): void {
	if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		connectionState = "disconnected";
		sendToRenderer("status", {
			state: "disconnected",
			message: "Max reconnection attempts reached",
		});
		return;
	}

	connectionState = "reconnecting";
	const delay = Math.min(
		BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
		30000
	);
	reconnectAttempts++;

	sendToRenderer("status", {
		state: "reconnecting",
		message: `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
	});

	reconnectTimer = setTimeout(async () => {
		const result = await connect();
		if (result.success) {
			sendToRenderer("status", { state: "connected", message: "Reconnected" });
		} else {
			scheduleReconnect();
		}
	}, delay);
}

// ─── Chat: Send message via agent method ────────────────────────────────────────

export async function sendChat(
	mainWindow: BrowserWindow,
	content: string,
	threadId?: string
): Promise<void> {
	mainWindowRef = mainWindow;

	if (!config || connectionState !== "connected") {
		sendToRenderer("error", {
			code: "NOT_CONNECTED",
			message: "Not connected to OpenClaw server",
		});
		return;
	}

	// Generate a message ID for tracking this response
	const messageId = crypto.randomUUID();
	currentMessageId = messageId;
	fullContent = "";
	chatRunning = true;

	// Send start indicator to renderer
	sendToRenderer("chat", {
		content: "",
		delta: false,
		done: false,
		messageId,
	} as IChatPayload);

	try {
		// Send agent request via WebSocket
		const idempotencyKey = crypto.randomUUID();

		sendFrame({
			type: "req",
			id: messageId,
			method: "agent",
			params: {
				sessionKey: threadId || sessionKey,
				message: content,
				idempotencyKey,
			},
		});

		// The response will come as:
		// 1. res with {runId, status: "accepted"} — ack
		// 2. event "agent" with {stream: "assistant", delta: "..."} — streaming text
		// 3. event "agent" with {stream: "lifecycle", phase: "end"} — done
		// These are handled by handleMessage -> handleAgentEvent

	} catch (err) {
		sendToRenderer("error", {
			code: "REQUEST_ERROR",
			message: (err as Error).message,
		});
		chatRunning = false;
		currentMessageId = null;
		fullContent = "";

		scheduleReconnect();
	}
}

// ─── Stop Active Chat ──────────────────────────────────────────────────────────

export function stopChat(): void {
	if (chatRunning) {
		// Send stop signal if possible
		sendFrame({
			type: "req",
			id: crypto.randomUUID(),
			method: "agent.stop",
			params: { sessionKey },
		});
		chatRunning = false;
		currentMessageId = null;
		fullContent = "";
	}
}

export function isActive(): boolean {
	return chatRunning;
}
