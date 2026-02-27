import type {
	IWSMessage,
	IWSTypedMessage,
	WSMessageType,
	IWSPayloadMap,
} from "../shared/types";

// ─── Message Construction ──────────────────────────────────────────────────────

export function createMessage<T extends WSMessageType>(
	type: T,
	sessionId: string,
	payload: IWSPayloadMap[T]
): IWSTypedMessage<T> {
	return {
		type,
		sessionId,
		payload,
		timestamp: new Date().toISOString(),
	};
}

// ─── Message Parsing ───────────────────────────────────────────────────────────

export function parseMessage(data: unknown): IWSMessage | null {
	if (!data || typeof data !== "object") return null;

	const msg = data as Record<string, unknown>;

	if (
		typeof msg.type !== "string" ||
		typeof msg.sessionId !== "string" ||
		typeof msg.timestamp !== "string"
	) {
		return null;
	}

	return {
		type: msg.type as WSMessageType,
		sessionId: msg.sessionId,
		payload: msg.payload,
		timestamp: msg.timestamp,
	};
}

// ─── Type Guards ───────────────────────────────────────────────────────────────

export function isMessageType<T extends WSMessageType>(
	msg: IWSMessage,
	type: T
): msg is IWSTypedMessage<T> {
	return msg.type === type;
}
