import WebSocket from "ws";
import { ExpertName, expertWsUrl, LIMITS } from "./types";
import { parseMessage, createConnectAuth } from "./protocol";

interface ExpertSession {
	ws: WebSocket;
	expert: ExpertName;
	busy: boolean;
	createdAt: number;
}

export class ExpertPool {
	private activeSessions: Map<string, ExpertSession[]> = new Map();
	private internalToken: string;

	constructor(internalToken: string) {
		this.internalToken = internalToken;
	}

	getActiveCount(expert: ExpertName): number {
		const sessions = this.activeSessions.get(expert) || [];
		return sessions.filter(s => s.busy).length;
	}

	async connectToExpert(
		expert: ExpertName,
		onMessage: (data: string) => void,
		onClose: () => void,
		onError: (err: Error) => void,
	): Promise<WebSocket> {
		const activeCount = this.getActiveCount(expert);
		if (activeCount >= LIMITS.maxConcurrentSessionsPerExpert) {
			throw new Error(`Expert ${expert} has ${activeCount} active sessions (max ${LIMITS.maxConcurrentSessionsPerExpert})`);
		}

		const url = expertWsUrl(expert);
		const ws = new WebSocket(url);

		return new Promise<WebSocket>((resolve, reject) => {
			const timeout = setTimeout(() => {
				ws.close();
				reject(new Error(`Connection to ${expert} timed out`));
			}, 10000);

			ws.on("open", () => {
				console.log(`[pool] Connected to ${expert} at ${url}`);
			});

			ws.on("message", (raw) => {
				const data = raw.toString();
				const msg = parseMessage(data);

				if (!msg) {
					onMessage(data);
					return;
				}

				// Handle connect handshake
				if (msg.type === "connect.challenge") {
					ws.send(createConnectAuth(this.internalToken));
					return;
				}

				if (msg.type === "connect.result") {
					clearTimeout(timeout);
					if ((msg as { status: string }).status === "ok") {
						const session: ExpertSession = {
							ws,
							expert,
							busy: true,
							createdAt: Date.now(),
						};
						if (!this.activeSessions.has(expert)) {
							this.activeSessions.set(expert, []);
						}
						this.activeSessions.get(expert)!.push(session);
						resolve(ws);
					} else {
						reject(new Error(`Auth failed with ${expert}: ${(msg as { error?: string }).error}`));
					}
					return;
				}

				// Forward all other messages
				onMessage(data);
			});

			ws.on("close", () => {
				clearTimeout(timeout);
				this.removeSession(expert, ws);
				onClose();
			});

			ws.on("error", (err) => {
				clearTimeout(timeout);
				this.removeSession(expert, ws);
				onError(err);
			});
		});
	}

	private removeSession(expert: ExpertName, ws: WebSocket): void {
		const sessions = this.activeSessions.get(expert);
		if (sessions) {
			const idx = sessions.findIndex(s => s.ws === ws);
			if (idx >= 0) sessions.splice(idx, 1);
		}
	}

	closeAll(): void {
		for (const [, sessions] of this.activeSessions) {
			for (const session of sessions) {
				try {
					session.ws.close();
				} catch {
					// ignore
				}
			}
		}
		this.activeSessions.clear();
	}
}
