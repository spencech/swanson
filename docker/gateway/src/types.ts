export interface ClassificationResult {
	primary: string;
	supporting: string[];
	focus: Record<string, string>;
	confidence: number;
	reason: string;
}

export interface ExpertResponse {
	expert: ExpertName;
	status: "pending" | "streaming" | "complete" | "failed";
	responseText: string;
	startedAt: number;
	completedAt?: number;
	error?: string;
}

export interface ConsultationRequest {
	requestId: string;
	fromExpert: string;
	toExpert: string;
	question: string;
	priority: "normal" | "high";
	parentRequestId?: string;
	depth: number;
	status: "queued" | "processing" | "completed" | "failed" | "cancelled";
	response?: string;
	createdAt: number;
	completedAt?: number;
}

export interface LogEntry {
	ts: string;
	type: "classify" | "request" | "event" | "response" | "consult" | "consult_response" | "error";
	from: string;
	to?: string;
	confidence?: number;
	reason?: string;
	message?: string;
	phase?: string;
	delta?: string;
	tokens?: number;
	duration_ms?: number;
	turns?: number;
	session?: string;
	priority?: string;
	requestId?: string;
	question?: string;
	error?: string;
}

export const EXPERTS = ["ron", "ben", "leslie", "tom", "ann", "april"] as const;
export type ExpertName = typeof EXPERTS[number];

export const EXPERT_PORTS: Record<ExpertName, number> = {
	ron: 18789,
	ben: 18789,
	leslie: 18789,
	tom: 18789,
	ann: 18789,
	april: 18789,
};

// All experts run on internal port 18789 — Docker DNS resolves service names
export function expertWsUrl(expert: ExpertName): string {
	return `ws://${expert}:${EXPERT_PORTS[expert]}/ws`;
}

// Circuit breaker limits
export const LIMITS = {
	maxConsultationDepth: 3,
	maxPendingPerAgent: 2,
	syncTimeout: 60000,
	asyncExpiry: 300000,
	maxQueueDepthPerExpert: 5,
	maxConcurrentSessionsPerExpert: 2,
} as const;
