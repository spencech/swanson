// OpenClaw WebSocket protocol message types and helpers

export interface OpenClawMessage {
	type: string;
	[key: string]: unknown;
}

export interface ConnectChallenge {
	type: "connect.challenge";
	challenge: string;
}

export interface ConnectAuth {
	type: "connect.auth";
	token: string;
}

export interface ConnectResult {
	type: "connect.result";
	status: "ok" | "error";
	error?: string;
}

export interface AgentRequest {
	type: "agent.request";
	threadId?: string;
	message: string;
	mode?: string;
}

export interface AgentEvent {
	type: "agent.event";
	payload: {
		type: string;
		data: {
			phase?: string;
			delta?: string;
			[key: string]: unknown;
		};
	};
}

export interface AgentResponse {
	type: "agent.response";
	threadId?: string;
	[key: string]: unknown;
}

export function parseMessage(data: string): OpenClawMessage | null {
	try {
		return JSON.parse(data) as OpenClawMessage;
	} catch {
		return null;
	}
}

export function createConnectAuth(token: string): string {
	return JSON.stringify({ type: "connect.auth", token });
}

export function createAgentRequest(message: string, threadId?: string, mode?: string): string {
	const req: AgentRequest = { type: "agent.request", message };
	if (threadId) req.threadId = threadId;
	if (mode) req.mode = mode;
	return JSON.stringify(req);
}

export function extractMessageText(msg: OpenClawMessage): string | null {
	if (msg.type === "agent.request") {
		return (msg as AgentRequest).message || null;
	}
	return null;
}
