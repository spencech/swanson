import { BrowserWindow } from "electron";
import http from "http";
import https from "https";
import type {
	IWSMessage,
	IChatPayload,
	IStatusPayload,
	IErrorPayload,
	WSMessageType,
} from "../shared/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OpenClawClientConfig {
	serverUrl: string;
	token: string;
	userEmail: string;
}

type ConnectionState = "disconnected" | "connected" | "reconnecting";

// ─── OpenClaw Client ───────────────────────────────────────────────────────────

let config: OpenClawClientConfig | null = null;
let connectionState: ConnectionState = "disconnected";
let activeRequest: http.ClientRequest | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;

// Session ID for conversation continuity (maps to OpenClaw's user-based session)
let sessionId: string | null = null;

function getBaseUrl(): URL | null {
	if (!config) return null;
	try {
		return new URL(config.serverUrl);
	} catch {
		return null;
	}
}

function makeRequest(
	path: string,
	options: http.RequestOptions,
	body?: string
): Promise<http.IncomingMessage> {
	const base = getBaseUrl();
	if (!base) return Promise.reject(new Error("No server URL configured"));

	const isHttps = base.protocol === "https:";
	const mod = isHttps ? https : http;

	const fullUrl = new URL(path, base);

	return new Promise((resolve, reject) => {
		const req = mod.request(
			fullUrl,
			{
				...options,
				headers: {
					...options.headers,
					Authorization: `Bearer ${config!.token}`,
					"Content-Type": "application/json",
				},
			},
			(res) => resolve(res)
		);

		req.on("error", reject);
		req.setTimeout(10000, () => {
			req.destroy(new Error("Request timeout"));
		});

		if (body) req.write(body);
		req.end();
	});
}

// ─── Connection Management ─────────────────────────────────────────────────────

export function configure(serverUrl: string, token: string, userEmail: string): void {
	config = { serverUrl, token, userEmail };
	sessionId = `swanson-${userEmail.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

export async function connect(): Promise<{ success: boolean; error?: string }> {
	if (!config) {
		return { success: false, error: "Client not configured. Set server URL and token first." };
	}

	try {
		// Verify server is reachable by hitting the models endpoint
		const res = await makeRequest("/v1/models", { method: "GET" });

		if (res.statusCode === 200 || res.statusCode === 401) {
			// 401 means server is up but token is wrong — still "reachable"
			if (res.statusCode === 401) {
				connectionState = "disconnected";
				return { success: false, error: "Invalid authentication token" };
			}
			connectionState = "connected";
			reconnectAttempts = 0;
			return { success: true };
		}

		connectionState = "disconnected";
		return { success: false, error: `Server returned status ${res.statusCode}` };
	} catch (err) {
		connectionState = "disconnected";
		return { success: false, error: `Cannot reach server: ${(err as Error).message}` };
	}
}

export function disconnect(): void {
	if (activeRequest) {
		activeRequest.destroy();
		activeRequest = null;
	}
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	connectionState = "disconnected";
	reconnectAttempts = 0;
}

export function getConnectionState(): ConnectionState {
	return connectionState;
}

export function getSessionId(): string | null {
	return sessionId;
}

// ─── Auto-Reconnect ────────────────────────────────────────────────────────────

function scheduleReconnect(mainWindow: BrowserWindow): void {
	if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		connectionState = "disconnected";
		sendToRenderer(mainWindow, "status", {
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

	sendToRenderer(mainWindow, "status", {
		state: "reconnecting",
		message: `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
	});

	reconnectTimer = setTimeout(async () => {
		const result = await connect();
		if (result.success) {
			sendToRenderer(mainWindow, "status", {
				state: "connected",
				message: "Reconnected",
			});
		} else {
			scheduleReconnect(mainWindow);
		}
	}, delay);
}

// ─── Send Message to Renderer ──────────────────────────────────────────────────

function sendToRenderer(
	mainWindow: BrowserWindow,
	type: WSMessageType,
	payload: unknown
): void {
	const message: IWSMessage = {
		type,
		sessionId: sessionId || "",
		payload,
		timestamp: new Date().toISOString(),
	};
	mainWindow.webContents.send("openclaw-message", message);
}

// ─── Chat: Send message and stream response ────────────────────────────────────

export async function sendChat(
	mainWindow: BrowserWindow,
	content: string,
	threadId?: string
): Promise<void> {
	if (!config || connectionState !== "connected") {
		sendToRenderer(mainWindow, "error", {
			code: "NOT_CONNECTED",
			message: "Not connected to OpenClaw server",
		});
		return;
	}

	// Generate a message ID for this response
	const messageId = crypto.randomUUID();

	// Send start indicator
	sendToRenderer(mainWindow, "chat", {
		content: "",
		delta: false,
		done: false,
		messageId,
	} as IChatPayload);

	try {
		const body = JSON.stringify({
			model: "openclaw:main",
			messages: [{ role: "user", content }],
			stream: true,
			user: sessionId,
		});

		const res = await makeRequest(
			"/v1/chat/completions",
			{ method: "POST" },
			body
		);

		if (res.statusCode !== 200) {
			let errorBody = "";
			for await (const chunk of res) {
				errorBody += chunk.toString();
			}
			sendToRenderer(mainWindow, "error", {
				code: "API_ERROR",
				message: `Server returned ${res.statusCode}: ${errorBody}`,
			});
			return;
		}

		activeRequest = res.req || null;

		// Parse SSE stream
		let buffer = "";
		let fullContent = "";

		res.on("data", (chunk: Buffer) => {
			buffer += chunk.toString();

			// Process complete SSE events
			const lines = buffer.split("\n");
			buffer = lines.pop() || ""; // Keep incomplete line in buffer

			for (const line of lines) {
				if (line.startsWith("data: ")) {
					const data = line.slice(6).trim();

					if (data === "[DONE]") {
						// Stream complete
						sendToRenderer(mainWindow, "chat", {
							content: fullContent,
							delta: false,
							done: true,
							messageId,
						} as IChatPayload);
						activeRequest = null;
						return;
					}

					try {
						const parsed = JSON.parse(data);
						const delta =
							parsed.choices?.[0]?.delta?.content ||
							parsed.choices?.[0]?.text ||
							"";

						if (delta) {
							fullContent += delta;
							sendToRenderer(mainWindow, "chat", {
								content: delta,
								delta: true,
								done: false,
								messageId,
							} as IChatPayload);
						}
					} catch {
						// Skip malformed SSE data
					}
				}
			}
		});

		res.on("end", () => {
			// Ensure done is sent even if [DONE] wasn't received
			sendToRenderer(mainWindow, "chat", {
				content: fullContent,
				delta: false,
				done: true,
				messageId,
			} as IChatPayload);
			activeRequest = null;
		});

		res.on("error", (err) => {
			sendToRenderer(mainWindow, "error", {
				code: "STREAM_ERROR",
				message: err.message,
			});
			activeRequest = null;

			// Attempt reconnection on stream error
			scheduleReconnect(mainWindow);
		});
	} catch (err) {
		sendToRenderer(mainWindow, "error", {
			code: "REQUEST_ERROR",
			message: (err as Error).message,
		});

		// Attempt reconnection on request error
		scheduleReconnect(mainWindow);
	}
}

// ─── Stop Active Request ───────────────────────────────────────────────────────

export function stopChat(): void {
	if (activeRequest) {
		activeRequest.destroy();
		activeRequest = null;
	}
}

export function isActive(): boolean {
	return activeRequest !== null;
}
