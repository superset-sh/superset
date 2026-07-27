import { z } from "zod";
import {
	cursorSchema,
	permissionIdSchema,
	permissionRequestSchema,
	planEntrySchema,
	sessionEventSchema,
	sessionIdSchema,
	sessionSchema,
	threadIdSchema,
	threadSchema,
	toolCallIdSchema,
	toolCallSchema,
	turnIdSchema,
	turnSchema,
} from "../protocol";

/**
 * The authoritative derived state of one session: what a pure fold of the
 * session event stream produces. The host maintains it as public authority;
 * clients fold the same reducer over snapshots plus live events.
 *
 * The projection deliberately excludes transcript bodies: messages and tool
 * outputs live in the durable event log, not here.
 */
export const sessionProjectionSchema = z
	.object({
		sessionId: sessionIdSchema,
		// The cursor of the last input folded into this projection.
		cursor: cursorSchema,
		session: sessionSchema,
		threadsById: z.record(threadIdSchema, threadSchema),
		// Turns that have not reached a terminal status yet.
		activeTurnsById: z.record(turnIdSchema, turnSchema),
		pendingPermissionsById: z.record(
			permissionIdSchema,
			permissionRequestSchema,
		),
		// Tool calls that have not reached a terminal state yet, host- and
		// client-resolved alike; consumers filter by resolver type.
		activeToolCallsById: z.record(toolCallIdSchema, toolCallSchema),
		// The latest planUpdated payload, empty until one arrives.
		plan: z.array(planEntrySchema).max(10_000),
	})
	.superRefine((projection, context) => {
		if (projection.session.id !== projection.sessionId) {
			context.addIssue({
				code: "custom",
				path: ["session", "id"],
				message: "session.id does not match projection sessionId",
			});
		}
		const mainThread = projection.threadsById[projection.session.mainThreadId];
		if (!mainThread || mainThread.kind !== "main") {
			context.addIssue({
				code: "custom",
				path: ["threadsById"],
				message: "projection must contain the session main thread (kind main)",
			});
		}
		const collections = [
			["threadsById", projection.threadsById, 10_000],
			["activeTurnsById", projection.activeTurnsById, 1_000],
			["pendingPermissionsById", projection.pendingPermissionsById, 1_000],
			["activeToolCallsById", projection.activeToolCallsById, 10_000],
		] as const;
		for (const [name, record, cap] of collections) {
			const entries = Object.entries(record);
			if (entries.length > cap) {
				context.addIssue({
					code: "custom",
					path: [name],
					message: `${name} exceeds ${cap} entries`,
				});
			}
			for (const [key, value] of entries) {
				if (value.id !== key) {
					context.addIssue({
						code: "custom",
						path: [name, key, "id"],
						message: "record key does not match entity id",
					});
				}
				if (value.sessionId !== projection.sessionId) {
					context.addIssue({
						code: "custom",
						path: [name, key, "sessionId"],
						message: "entity sessionId does not match projection sessionId",
					});
				}
			}
		}
		for (const [turnId, turn] of Object.entries(projection.activeTurnsById)) {
			if (turn.status !== "accepted" && turn.status !== "running") {
				context.addIssue({
					code: "custom",
					path: ["activeTurnsById", turnId, "status"],
					message: "active turn must not be terminal",
				});
			}
		}
		for (const [toolCallId, toolCall] of Object.entries(
			projection.activeToolCallsById,
		)) {
			if (
				toolCall.state === "succeeded" ||
				toolCall.state === "failed" ||
				toolCall.state === "cancelled"
			) {
				context.addIssue({
					code: "custom",
					path: ["activeToolCallsById", toolCallId, "state"],
					message: "active tool call must not be terminal",
				});
			}
		}
	});

export const projectionInputSchema = z
	.discriminatedUnion("type", [
		z.object({
			type: z.literal("snapshot"),
			cursor: cursorSchema,
			value: sessionProjectionSchema,
		}),
		z.object({
			type: z.literal("event"),
			cursor: cursorSchema,
			value: sessionEventSchema,
		}),
	])
	.superRefine((input, context) => {
		if (input.value.cursor !== input.cursor) {
			context.addIssue({
				code: "custom",
				path: ["value", "cursor"],
				message: "input cursor does not match nested value cursor",
			});
		}
	});

export type SessionProjection = z.infer<typeof sessionProjectionSchema>;
export type ProjectionInput = z.infer<typeof projectionInputSchema>;

export type ProjectionErrorCode =
	| "PROJECTION_NOT_INITIALIZED"
	| "PROJECTION_SESSION_MISMATCH";

/**
 * A programming error in reducer dispatch: inputs must be validated and
 * routed to the projection of the session they belong to before folding.
 */
export class ProjectionError extends Error {
	readonly code: ProjectionErrorCode;

	constructor(code: ProjectionErrorCode, message: string) {
		super(message);
		this.name = "ProjectionError";
		this.code = code;
	}
}
