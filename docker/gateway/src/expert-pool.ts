import WebSocket from "ws";
import { ExpertName, expertWsUrl, LIMITS } from "./types";
import { parseMessage } from "./protocol";

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
				console.log(`[pool] ← ${expert}: ${data.slice(0, 300)}`);
				const msg = parseMessage(data);

				if (!msg) {
					onMessage(data);
					return;
				}

				// Handle connect handshake — support both OpenClaw and legacy formats
				const isOpenClawChallenge = msg.type === "event" && (msg as { event?: string }).event === "connect.challenge";
				const isLegacyChallenge = msg.type === "connect.challenge";

				if (isOpenClawChallenge || isLegacyChallenge) {
					// Send auth in OpenClaw protocol format
					const authFrame = JSON.stringify({
						type: "req",
						id: `pool-auth-${Date.now()}`,
						method: "connect",
						params: {
							minProtocol: 3,
							maxProtocol: 3,
							client: { id: "cli", version: "1.0.0", platform: "linux", mode: "cli" },
							role: "operator",
							scopes: ["operator.read", "operator.write"],
							auth: { token: this.internalToken },
						},
					});
					console.log(`[pool] → ${expert} auth: ${authFrame.slice(0, 300)}`);
					ws.send(authFrame);
					return;
				}

				// Handle auth response — support both OpenClaw and legacy formats
				const isOpenClawRes = msg.type === "res" && (msg as { id?: string }).id?.startsWith("pool-auth-");
				const isLegacyResult = msg.type === "connect.result";

				if (isOpenClawRes || isLegacyResult) {
					clearTimeout(timeout);
					const isOk = isOpenClawRes
						? (msg as { ok?: boolean }).ok === true
						: (msg as unknown as { status: string }).status === "ok";

					if (isOk) {
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
						const error = (msg as { error?: unknown }).error;
						reject(new Error(`Auth failed with ${expert}: ${typeof error === "string" ? error : JSON.stringify(error)}`));
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

	async querySessionStats(expert: ExpertName): Promise<Record<string, unknown>> {
		const sessions = this.activeSessions.get(expert) || [];
		const activeSessions = sessions.filter(s => s.busy).length;
		const totalSessions = sessions.length;
		const oldest = sessions.length > 0
			? Math.min(...sessions.map(s => s.createdAt))
			: null;

		return {
			activeSessions,
			totalSessions,
			oldestSessionAge: oldest ? `${Math.round((Date.now() - oldest) / 1000)}s` : null,
		};
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
