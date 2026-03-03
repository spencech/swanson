import { v4 as uuidv4 } from "uuid";
import { ConsultationRequest, ExpertName, EXPERTS, LIMITS } from "./types";
import { ExpertPool } from "./expert-pool";
import { createAgentRequest, parseMessage } from "./protocol";

export class ConsultationBroker {
	private requests: Map<string, ConsultationRequest> = new Map();
	private expertPool: ExpertPool;
	private cleanupInterval: NodeJS.Timeout;

	constructor(expertPool: ExpertPool) {
		this.expertPool = expertPool;

		// Garbage collect expired async responses every 60s
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [id, req] of this.requests) {
				if (req.status === "completed" && now - (req.completedAt || req.createdAt) > LIMITS.asyncExpiry) {
					this.requests.delete(id);
				}
				if (req.status === "queued" && now - req.createdAt > LIMITS.asyncExpiry) {
					req.status = "failed";
					req.response = "Request expired before processing";
				}
			}
		}, 60000);
	}

	submitSync(
		fromExpert: string,
		toExpert: string,
		question: string,
		priority: "normal" | "high",
		parentRequestId?: string,
		depth: number = 0,
	): Promise<{ requestId: string; response: string }> {
		// Validate
		const validation = this.validateRequest(fromExpert, toExpert, parentRequestId, depth);
		if (validation) return Promise.reject(new Error(validation));

		const requestId = uuidv4();
		const req: ConsultationRequest = {
			requestId,
			fromExpert,
			toExpert,
			question,
			priority,
			parentRequestId,
			depth,
			status: "queued",
			createdAt: Date.now(),
		};
		this.requests.set(requestId, req);

		return new Promise<{ requestId: string; response: string }>((resolve, reject) => {
			const timeout = setTimeout(() => {
				req.status = "failed";
				req.response = "Sync consultation timed out";
				reject(new Error(`Sync consultation to ${toExpert} timed out after ${LIMITS.syncTimeout}ms`));
			}, LIMITS.syncTimeout);

			req.status = "processing";
			this.executeConsultation(req).then((response) => {
				clearTimeout(timeout);
				req.status = "completed";
				req.response = response;
				req.completedAt = Date.now();
				resolve({ requestId, response });
			}).catch((err) => {
				clearTimeout(timeout);
				req.status = "failed";
				req.response = `Error: ${(err as Error).message}`;
				reject(err);
			});
		});
	}

	async submitAsync(
		fromExpert: string,
		toExpert: string,
		question: string,
		priority: "normal" | "high",
		parentRequestId?: string,
		depth: number = 0,
	): Promise<{ requestId: string; status: string }> {
		const validation = this.validateRequest(fromExpert, toExpert, parentRequestId, depth);
		if (validation) throw new Error(validation);

		// Check concurrent async limit
		const pendingCount = Array.from(this.requests.values()).filter(
			r => r.fromExpert === fromExpert && (r.status === "queued" || r.status === "processing")
		).length;
		if (pendingCount >= LIMITS.maxPendingPerAgent) {
			throw new Error(`Too many pending consultations from ${fromExpert} (max ${LIMITS.maxPendingPerAgent})`);
		}

		const requestId = uuidv4();
		const req: ConsultationRequest = {
			requestId,
			fromExpert,
			toExpert,
			question,
			priority,
			parentRequestId,
			depth,
			status: "queued",
			createdAt: Date.now(),
		};
		this.requests.set(requestId, req);

		// Process in background
		this.processAsync(req).catch(err => {
			req.status = "failed";
			req.response = `Error: ${(err as Error).message}`;
		});

		return { requestId, status: "queued" };
	}

	getStatus(requestId: string): ConsultationRequest | null {
		return this.requests.get(requestId) || null;
	}

	cancel(requestId: string): boolean {
		const req = this.requests.get(requestId);
		if (req && (req.status === "queued" || req.status === "processing")) {
			req.status = "cancelled";
			return true;
		}
		return false;
	}

	getHealth(): { queueDepth: Record<string, number>; activeSessions: Record<string, number> } {
		const queueDepth: Record<string, number> = {};
		const activeSessions: Record<string, number> = {};

		for (const expert of EXPERTS) {
			queueDepth[expert] = Array.from(this.requests.values()).filter(
				r => r.toExpert === expert && (r.status === "queued" || r.status === "processing")
			).length;
			activeSessions[expert] = this.expertPool.getActiveCount(expert);
		}

		return { queueDepth, activeSessions };
	}

	private validateRequest(fromExpert: string, toExpert: string, parentRequestId?: string, depth: number = 0): string | null {
		// Validate expert names
		if (!EXPERTS.includes(toExpert as ExpertName)) {
			return `Unknown expert: ${toExpert}`;
		}

		// Can't consult yourself
		if (fromExpert === toExpert) {
			return `Expert ${fromExpert} cannot consult itself`;
		}

		// Check depth
		if (depth >= LIMITS.maxConsultationDepth) {
			return `Max consultation depth (${LIMITS.maxConsultationDepth}) reached. Respond with what you know.`;
		}

		// Check circular
		if (parentRequestId) {
			const chain = this.getChain(parentRequestId);
			if (chain.includes(toExpert)) {
				return `Circular consultation detected: ${chain.join(" → ")} → ${toExpert}. Respond with what you know or escalate to human.`;
			}
		}

		// Check queue depth
		const queueDepth = Array.from(this.requests.values()).filter(
			r => r.toExpert === toExpert && (r.status === "queued" || r.status === "processing")
		).length;
		if (queueDepth >= LIMITS.maxQueueDepthPerExpert) {
			return `Expert ${toExpert} is busy (${queueDepth} pending requests)`;
		}

		return null;
	}

	private getChain(requestId: string): string[] {
		const chain: string[] = [];
		let current = this.requests.get(requestId);
		while (current) {
			chain.unshift(current.fromExpert);
			current = current.parentRequestId ? this.requests.get(current.parentRequestId) : undefined;
		}
		return chain;
	}

	private async processAsync(req: ConsultationRequest): Promise<void> {
		req.status = "processing";
		try {
			const response = await this.executeConsultation(req);
			// Check if cancelled while we were waiting
			if (req.status === "cancelled") return;
			req.response = response;
			req.status = "completed";
			req.completedAt = Date.now();
		} catch (err) {
			if (req.status === "cancelled") return;
			req.status = "failed";
			req.response = `Error: ${(err as Error).message}`;
		}
	}

	private executeConsultation(req: ConsultationRequest): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let responseText = "";
			let resolved = false;

			this.expertPool.connectToExpert(
				req.toExpert as ExpertName,
				(data: string) => {
					const msg = parseMessage(data);
					if (!msg) return;

					if (msg.type === "agent.event") {
						const payload = (msg as { payload?: { data?: { delta?: string } } }).payload;
						if (payload?.data?.delta) {
							responseText += payload.data.delta;
						}
					}

					if (msg.type === "agent.response") {
						if (!resolved) {
							resolved = true;
							resolve(responseText || "No response content");
						}
					}
				},
				() => {
					if (!resolved) {
						resolved = true;
						resolve(responseText || "Connection closed before response");
					}
				},
				(err: Error) => {
					if (!resolved) {
						resolved = true;
						reject(err);
					}
				},
			).then((expertWs) => {
				// Send the consultation question as an agent request
				const consultPrompt = `[CONSULTATION from ${req.fromExpert}, depth=${req.depth + 1}]\n\n${req.question}`;
				expertWs.send(createAgentRequest(consultPrompt));
			}).catch((err) => {
				if (!resolved) {
					resolved = true;
					reject(err);
				}
			});
		});
	}

	destroy(): void {
		clearInterval(this.cleanupInterval);
	}
}
