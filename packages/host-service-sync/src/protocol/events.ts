import { z } from "zod";
import {
	contentBlockSchema,
	messageSchema,
	permissionOutcomeSchema,
	permissionRequestSchema,
	planEntrySchema,
	sessionSchema,
	sessionSettingsSchema,
	stopReasonSchema,
	threadSchema,
	toolCallSchema,
	toolCallUpdateSchema,
	turnSchema,
} from "./entities";
import {
	cursorSchema,
	eventIdSchema,
	permissionIdSchema,
	requestIdSchema,
	sessionErrorSchema,
	sessionIdSchema,
	threadIdSchema,
	timestampSchema,
	toolCallIdSchema,
	turnIdSchema,
} from "./primitives";

export const sessionEventPayloadSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("threadCreated"), thread: threadSchema }),
	z.object({ type: z.literal("threadUpdated"), thread: threadSchema }),
	z.object({ type: z.literal("turnStarted"), turn: turnSchema }),
	z.object({
		type: z.literal("turnCompleted"),
		turnId: turnIdSchema,
		stopReason: stopReasonSchema,
	}),
	z.object({
		type: z.literal("turnFailed"),
		turnId: turnIdSchema,
		error: sessionErrorSchema,
	}),
	z.object({ type: z.literal("turnCancelled"), turnId: turnIdSchema }),
	z.object({ type: z.literal("messageStarted"), message: messageSchema }),
	z.object({
		type: z.literal("messageDelta"),
		messageId: z.string().min(1).max(256),
		content: contentBlockSchema,
	}),
	z.object({
		type: z.literal("messageCompleted"),
		messageId: z.string().min(1).max(256),
	}),
	z.object({
		type: z.literal("toolCallStarted"),
		toolCall: toolCallSchema,
	}),
	z.object({
		type: z.literal("toolCallUpdated"),
		toolCallId: toolCallIdSchema,
		update: toolCallUpdateSchema,
	}),
	z.object({
		type: z.literal("permissionRequested"),
		permission: permissionRequestSchema,
	}),
	z.object({
		type: z.literal("permissionResolved"),
		permissionId: permissionIdSchema,
		outcome: permissionOutcomeSchema,
	}),
	z.object({
		type: z.literal("planUpdated"),
		plan: z.array(planEntrySchema).max(10_000),
	}),
	z.object({
		type: z.literal("settingsUpdated"),
		settings: sessionSettingsSchema,
	}),
	z.object({ type: z.literal("error"), error: sessionErrorSchema }),
]);

export const sessionEventSchema = z
	.object({
		id: eventIdSchema,
		sessionId: sessionIdSchema,
		threadId: threadIdSchema,
		cursor: cursorSchema,
		occurredAt: timestampSchema,
		// The idempotent requestId of the mutation this event resulted from,
		// or null for host/adapter-originated transitions.
		causationId: requestIdSchema.nullable(),
		payload: sessionEventPayloadSchema,
	})
	.superRefine((event, context) => {
		const payload = event.payload;
		const thread =
			payload.type === "threadCreated" || payload.type === "threadUpdated"
				? payload.thread
				: null;
		const nested =
			payload.type === "turnStarted"
				? payload.turn
				: payload.type === "messageStarted"
					? payload.message
					: payload.type === "toolCallStarted"
						? payload.toolCall
						: payload.type === "permissionRequested"
							? payload.permission
							: null;
		const nestedSessionId = thread?.sessionId ?? nested?.sessionId;
		const nestedThreadId = thread?.id ?? nested?.threadId;
		if (nestedSessionId !== undefined && nestedSessionId !== event.sessionId) {
			context.addIssue({
				code: "custom",
				path: ["payload"],
				message: "nested sessionId does not match event sessionId",
			});
		}
		if (nestedThreadId !== undefined && nestedThreadId !== event.threadId) {
			context.addIssue({
				code: "custom",
				path: ["payload"],
				message: "nested threadId does not match event threadId",
			});
		}
		if (
			payload.type === "turnStarted" &&
			payload.turn.status !== "accepted" &&
			payload.turn.status !== "running"
		) {
			// The projection stores started turns as active; a terminal status
			// here would mint a projection that violates its own invariants.
			context.addIssue({
				code: "custom",
				path: ["payload", "turn", "status"],
				message: "turnStarted must carry an active turn status",
			});
		}
	});

export const hostEventSchema = z
	.discriminatedUnion("type", [
		z.object({ type: z.literal("sessionUpsert"), session: sessionSchema }),
		z.object({
			type: z.literal("sessionRemoved"),
			reason: z.enum(["archived", "closed", "deleted"]),
		}),
		z.object({
			type: z.literal("permissionAvailable"),
			permission: permissionRequestSchema,
		}),
		z.object({
			type: z.literal("permissionResolved"),
			permissionId: permissionIdSchema,
		}),
		z.object({
			type: z.literal("clientToolCallAvailable"),
			toolCall: toolCallSchema,
		}),
		z.object({
			type: z.literal("clientToolCallResolved"),
			toolCallId: toolCallIdSchema,
		}),
	])
	.superRefine((event, context) => {
		if (
			event.type === "clientToolCallAvailable" &&
			event.toolCall.resolver.type !== "client"
		) {
			context.addIssue({
				code: "custom",
				path: ["toolCall", "resolver", "type"],
				message: "client tool call must use a client resolver",
			});
		}
	});

export type SessionEventPayload = z.infer<typeof sessionEventPayloadSchema>;
export type SessionEvent = z.infer<typeof sessionEventSchema>;
export type HostEvent = z.infer<typeof hostEventSchema>;
