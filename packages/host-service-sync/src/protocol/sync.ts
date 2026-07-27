import { z } from "zod";
import { hostEventSchema, sessionEventSchema } from "./events";
import {
	clientInstanceIdSchema,
	connectionIdSchema,
	cursorSchema,
	hostIdSchema,
	protocolVersionSchema,
	requestIdSchema,
	sessionIdSchema,
	subscriptionIdSchema,
	syncErrorCodeSchema,
	threadIdSchema,
	timestampSchema,
} from "./primitives";

export const toolResolverDescriptorSchema = z.object({
	name: z.string().min(1).max(256),
	version: z.number().int().safe().positive(),
});

export const clientVersionSchema = z.string().min(1).max(256);

export const syncStreamSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("host") }),
	z.object({ type: z.literal("session"), sessionId: sessionIdSchema }),
]);

export const helloPacketSchema = z.object({
	type: z.literal("hello"),
	// The handshake is the only place the protocol version appears.
	protocolVersion: protocolVersionSchema,
	requestId: requestIdSchema,
	clientInstanceId: clientInstanceIdSchema,
	clientVersion: clientVersionSchema,
	toolResolvers: z.array(toolResolverDescriptorSchema).max(1_000),
});

export const toolResolversChangedPacketSchema = z.object({
	type: z.literal("toolResolversChanged"),
	requestId: requestIdSchema,
	toolResolvers: z.array(toolResolverDescriptorSchema).max(1_000),
});

/**
 * `after` is required: snapshots ride tRPC (`sessions.list` / `sessions.get`
 * return `head`), so a subscribe always resumes from a cursor the host
 * handed out. An unservable cursor yields `reset` and the client re-runs
 * the tRPC cold path — there is no snapshot-over-socket fallback.
 */
export const subscribePacketSchema = z.object({
	type: z.literal("subscribe"),
	requestId: requestIdSchema,
	subscriptionId: subscriptionIdSchema,
	stream: syncStreamSchema,
	after: cursorSchema,
});

export const unsubscribePacketSchema = z.object({
	type: z.literal("unsubscribe"),
	requestId: requestIdSchema,
	subscriptionId: subscriptionIdSchema,
});

export const pingPacketSchema = z.object({
	type: z.literal("ping"),
	nonce: z.string().min(1).max(256),
});

export const syncClientPacketSchema = z.discriminatedUnion("type", [
	helloPacketSchema,
	toolResolversChangedPacketSchema,
	subscribePacketSchema,
	unsubscribePacketSchema,
	pingPacketSchema,
]);

export const helloAckPacketSchema = z.object({
	type: z.literal("helloAck"),
	protocolVersion: protocolVersionSchema,
	requestId: requestIdSchema,
	hostId: hostIdSchema,
	connectionId: connectionIdSchema,
	serverTime: timestampSchema,
	limits: z.object({
		maxSubscriptions: z.number().int().safe().positive(),
		maxFrameBytes: z.number().int().safe().positive(),
	}),
});

export const subscribedPacketSchema = z
	.object({
		type: z.literal("subscribed"),
		requestId: requestIdSchema,
		subscriptionId: subscriptionIdSchema,
		stream: z.enum(["host", "session"]),
		sessionId: sessionIdSchema.nullable(),
		replay: z.object({
			fromExclusive: cursorSchema,
			through: cursorSchema,
		}),
	})
	.superRefine((packet, context) => {
		if (
			(packet.stream === "host" && packet.sessionId !== null) ||
			(packet.stream === "session" && packet.sessionId === null)
		) {
			context.addIssue({
				code: "custom",
				path: ["sessionId"],
				message: "sessionId presence does not match stream",
			});
		}
	});

export const hostEventPacketSchema = z
	.object({
		type: z.literal("event"),
		hostId: hostIdSchema,
		subscriptionId: subscriptionIdSchema,
		stream: z.literal("host"),
		sessionId: sessionIdSchema,
		threadId: threadIdSchema.nullable(),
		cursor: cursorSchema,
		event: hostEventSchema,
	})
	.superRefine((packet, context) => {
		const event = packet.event;
		const nestedSessionId =
			event.type === "sessionUpsert"
				? event.session.id
				: event.type === "permissionAvailable"
					? event.permission.sessionId
					: event.type === "clientToolCallAvailable"
						? event.toolCall.sessionId
						: packet.sessionId;
		if (nestedSessionId !== packet.sessionId) {
			context.addIssue({
				code: "custom",
				path: ["event"],
				message: "host event sessionId does not match packet sessionId",
			});
		}
		const nestedThreadId =
			event.type === "permissionAvailable"
				? event.permission.threadId
				: event.type === "clientToolCallAvailable"
					? event.toolCall.threadId
					: null;
		if (nestedThreadId !== null && packet.threadId !== nestedThreadId) {
			context.addIssue({
				code: "custom",
				path: ["threadId"],
				message: "host event threadId does not match packet threadId",
			});
		}
	});

export const sessionEventPacketSchema = z
	.object({
		type: z.literal("event"),
		hostId: hostIdSchema,
		subscriptionId: subscriptionIdSchema,
		stream: z.literal("session"),
		sessionId: sessionIdSchema,
		threadId: threadIdSchema,
		cursor: cursorSchema,
		event: sessionEventSchema,
	})
	.superRefine((packet, context) => {
		if (packet.event.sessionId !== packet.sessionId) {
			context.addIssue({
				code: "custom",
				path: ["event", "sessionId"],
				message: "session event sessionId does not match packet sessionId",
			});
		}
		if (packet.event.threadId !== packet.threadId) {
			context.addIssue({
				code: "custom",
				path: ["event", "threadId"],
				message: "session event threadId does not match packet threadId",
			});
		}
		if (packet.event.cursor !== packet.cursor) {
			// The hub delivers each event at its own cursor; a divergence would
			// leave reconnect state and the stored log at different positions.
			context.addIssue({
				code: "custom",
				path: ["event", "cursor"],
				message: "session event cursor does not match packet cursor",
			});
		}
	});

export const caughtUpPacketSchema = z
	.object({
		type: z.literal("caughtUp"),
		subscriptionId: subscriptionIdSchema,
		stream: z.enum(["host", "session"]),
		sessionId: sessionIdSchema.nullable(),
		through: cursorSchema,
	})
	.superRefine((packet, context) => {
		if (
			(packet.stream === "host" && packet.sessionId !== null) ||
			(packet.stream === "session" && packet.sessionId === null)
		) {
			context.addIssue({
				code: "custom",
				path: ["sessionId"],
				message: "sessionId presence does not match stream",
			});
		}
	});

export const unsubscribedPacketSchema = z
	.object({
		type: z.literal("unsubscribed"),
		requestId: requestIdSchema,
		subscriptionId: subscriptionIdSchema,
		stream: z.enum(["host", "session"]),
		sessionId: sessionIdSchema.nullable(),
		through: cursorSchema.nullable(),
	})
	.superRefine((packet, context) => {
		if (
			(packet.stream === "host" && packet.sessionId !== null) ||
			(packet.stream === "session" && packet.sessionId === null)
		) {
			context.addIssue({
				code: "custom",
				path: ["sessionId"],
				message: "sessionId presence does not match stream",
			});
		}
	});

/**
 * Reset recovery is always the cold path: re-fetch the snapshot over tRPC
 * (`list` for the host stream, `get` for a session stream) and resubscribe
 * from its head. One enum value on purpose — recovery must never fork.
 */
export const resetPacketSchema = z
	.object({
		type: z.literal("reset"),
		subscriptionId: subscriptionIdSchema,
		stream: z.enum(["host", "session"]),
		sessionId: sessionIdSchema.nullable(),
		code: z.enum(["CURSOR_EXPIRED", "CURSOR_INVALID", "HISTORY_REWRITTEN"]),
		recovery: z.literal("refetchSnapshot"),
	})
	.superRefine((packet, context) => {
		if (
			(packet.stream === "host" && packet.sessionId !== null) ||
			(packet.stream === "session" && packet.sessionId === null)
		) {
			context.addIssue({
				code: "custom",
				path: ["sessionId"],
				message: "sessionId presence does not match stream",
			});
		}
	});

export const syncErrorPacketSchema = z.object({
	type: z.literal("error"),
	requestId: requestIdSchema.nullable(),
	subscriptionId: subscriptionIdSchema.nullable(),
	sessionId: sessionIdSchema.nullable(),
	code: syncErrorCodeSchema,
	retryable: z.boolean(),
});

export const pongPacketSchema = z.object({
	type: z.literal("pong"),
	nonce: z.string().min(1).max(256),
});

export const syncServerPacketSchema = z.union([
	helloAckPacketSchema,
	subscribedPacketSchema,
	hostEventPacketSchema,
	sessionEventPacketSchema,
	caughtUpPacketSchema,
	unsubscribedPacketSchema,
	resetPacketSchema,
	syncErrorPacketSchema,
	pongPacketSchema,
]);

export type ToolResolverDescriptor = z.infer<
	typeof toolResolverDescriptorSchema
>;
export type SyncStream = z.infer<typeof syncStreamSchema>;
export type HelloPacket = z.infer<typeof helloPacketSchema>;
export type ToolResolversChangedPacket = z.infer<
	typeof toolResolversChangedPacketSchema
>;
export type SubscribePacket = z.infer<typeof subscribePacketSchema>;
export type UnsubscribePacket = z.infer<typeof unsubscribePacketSchema>;
export type PingPacket = z.infer<typeof pingPacketSchema>;
export type SyncClientPacket = z.infer<typeof syncClientPacketSchema>;
export type HelloAckPacket = z.infer<typeof helloAckPacketSchema>;
export type SubscribedPacket = z.infer<typeof subscribedPacketSchema>;
export type HostEventPacket = z.infer<typeof hostEventPacketSchema>;
export type SessionEventPacket = z.infer<typeof sessionEventPacketSchema>;
export type SyncEventPacket = HostEventPacket | SessionEventPacket;
export type CaughtUpPacket = z.infer<typeof caughtUpPacketSchema>;
export type UnsubscribedPacket = z.infer<typeof unsubscribedPacketSchema>;
export type ResetPacket = z.infer<typeof resetPacketSchema>;
export type SyncErrorPacket = z.infer<typeof syncErrorPacketSchema>;
export type PongPacket = z.infer<typeof pongPacketSchema>;
export type SyncServerPacket = z.infer<typeof syncServerPacketSchema>;
