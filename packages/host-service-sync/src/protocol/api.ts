/**
 * Input/output schemas for the host `sessions.*` tRPC procedures.
 *
 * The host router parses every input AND output with these schemas; typed
 * `AppRouter` inference never replaces runtime validation. Every mutation
 * carries an idempotent `requestId`, and mutation outputs acknowledge
 * admission (receipts), not completion — completion arrives as canonical
 * events whose `causationId` echoes the request id.
 *
 * Snapshots ride tRPC (`list` = host snapshot, `get` = session snapshot);
 * the sync socket carries only per-event frames. Every snapshot and window
 * carries the `head` cursor the client subscribes from.
 */
import { z } from "zod";
import {
	contentBlockSchema,
	permissionOutcomeSchema,
	permissionRequestSchema,
	sessionSchema,
	sessionSettingsSchema,
	threadSchema,
	toolCallOutcomeSchema,
	toolCallSchema,
	turnSchema,
} from "./entities";
import { sessionEventSchema } from "./events";
import {
	cursorSchema,
	eventIdSchema,
	permissionIdSchema,
	requestIdSchema,
	sessionIdSchema,
	threadIdSchema,
	timestampSchema,
	toolCallIdSchema,
	turnIdSchema,
	workspaceIdSchema,
} from "./primitives";

const eventPageLimitSchema = z.number().int().safe().min(1).max(100);

/**
 * `list` returns the complete host snapshot: every non-archived session plus
 * the cross-session pending cards a sessions list needs for attention
 * badges, and the host-stream cursor to subscribe from. No pagination —
 * a host's live session count is small by construction.
 *
 * Ungated capability probe: hosts with sessions disabled answer empty
 * arrays and a null head.
 */
export const hostSnapshotSchema = z
	.object({
		sessions: z.array(sessionSchema).max(10_000),
		pendingPermissions: z.array(permissionRequestSchema).max(10_000),
		openClientToolCalls: z.array(toolCallSchema).max(10_000),
		head: cursorSchema.nullable(),
	})
	.superRefine((snapshot, context) => {
		const sessionIds = new Set<string>();
		for (const [index, session] of snapshot.sessions.entries()) {
			if (sessionIds.has(session.id)) {
				context.addIssue({
					code: "custom",
					path: ["sessions", index, "id"],
					message: "duplicate session id in host snapshot",
				});
			}
			sessionIds.add(session.id);
		}
		const permissionIds = new Set<string>();
		for (const [index, permission] of snapshot.pendingPermissions.entries()) {
			if (!sessionIds.has(permission.sessionId)) {
				context.addIssue({
					code: "custom",
					path: ["pendingPermissions", index, "sessionId"],
					message: "pending permission references an unlisted session",
				});
			}
			if (permissionIds.has(permission.id)) {
				context.addIssue({
					code: "custom",
					path: ["pendingPermissions", index, "id"],
					message: "duplicate permission id in host snapshot",
				});
			}
			permissionIds.add(permission.id);
		}
		const toolCallIds = new Set<string>();
		for (const [index, toolCall] of snapshot.openClientToolCalls.entries()) {
			if (!sessionIds.has(toolCall.sessionId)) {
				context.addIssue({
					code: "custom",
					path: ["openClientToolCalls", index, "sessionId"],
					message: "client tool call references an unlisted session",
				});
			}
			if (toolCall.resolver.type !== "client") {
				context.addIssue({
					code: "custom",
					path: ["openClientToolCalls", index, "resolver", "type"],
					message: "client tool call must use a client resolver",
				});
			}
			if (toolCallIds.has(toolCall.id)) {
				context.addIssue({
					code: "custom",
					path: ["openClientToolCalls", index, "id"],
					message: "duplicate tool call id in host snapshot",
				});
			}
			toolCallIds.add(toolCall.id);
		}
		if (
			snapshot.head === null &&
			(snapshot.sessions.length > 0 ||
				snapshot.pendingPermissions.length > 0 ||
				snapshot.openClientToolCalls.length > 0)
		) {
			context.addIssue({
				code: "custom",
				path: ["head"],
				message: "a null head (sessions disabled) requires an empty snapshot",
			});
		}
	});

export const createSessionInputSchema = z.object({
	requestId: requestIdSchema,
	workspaceId: workspaceIdSchema,
	agentId: z.string().min(1).max(256),
	title: z.string().max(4_096).nullable(),
	settings: sessionSettingsSchema,
});

export const createSessionResultSchema = z
	.object({
		session: sessionSchema,
		mainThread: threadSchema,
	})
	.superRefine((result, context) => {
		if (result.mainThread.id !== result.session.mainThreadId) {
			context.addIssue({
				code: "custom",
				path: ["mainThread", "id"],
				message: "mainThread.id does not match session.mainThreadId",
			});
		}
		if (result.mainThread.sessionId !== result.session.id) {
			context.addIssue({
				code: "custom",
				path: ["mainThread", "sessionId"],
				message: "mainThread.sessionId does not match session.id",
			});
		}
		if (result.mainThread.kind !== "main") {
			context.addIssue({
				code: "custom",
				path: ["mainThread", "kind"],
				message: "create result mainThread must have kind main",
			});
		}
	});

export const getSessionInputSchema = z.object({ sessionId: sessionIdSchema });

/**
 * `get` returns the session snapshot: full projection (threads, active
 * turns, pending cards, open client tool calls) plus a bounded tail of
 * recent events for one-round-trip first paint, and the session-stream
 * `head` cursor to subscribe from. Older content is `getEvents` territory.
 */
export const sessionSnapshotSchema = z
	.object({
		session: sessionSchema,
		threads: z.array(threadSchema).max(10_000),
		activeTurns: z.array(turnSchema).max(1_000),
		pendingPermissions: z.array(permissionRequestSchema).max(10_000),
		openToolCalls: z.array(toolCallSchema).max(10_000),
		recentEvents: z.array(sessionEventSchema).max(200),
		// Whether events older than the recent tail exist (pageable via
		// getEvents, or lost to ring truncation — either way, not "complete").
		hasOlderEvents: z.boolean(),
		head: cursorSchema,
	})
	.superRefine((snapshot, context) => {
		const sessionId = snapshot.session.id;
		const threadsById = new Map<string, (typeof snapshot.threads)[number]>();
		for (const [index, thread] of snapshot.threads.entries()) {
			if (thread.sessionId !== sessionId) {
				context.addIssue({
					code: "custom",
					path: ["threads", index, "sessionId"],
					message: "thread sessionId does not match snapshot session id",
				});
			}
			if (threadsById.has(thread.id)) {
				context.addIssue({
					code: "custom",
					path: ["threads", index, "id"],
					message: "duplicate thread id in session snapshot",
				});
			}
			threadsById.set(thread.id, thread);
		}
		const mainThread = threadsById.get(snapshot.session.mainThreadId);
		if (!mainThread || mainThread.kind !== "main") {
			context.addIssue({
				code: "custom",
				path: ["threads"],
				message: "session snapshot must contain its declared main thread",
			});
		}
		for (const [index, thread] of snapshot.threads.entries()) {
			if (
				thread.parentThreadId !== null &&
				!threadsById.has(thread.parentThreadId)
			) {
				context.addIssue({
					code: "custom",
					path: ["threads", index, "parentThreadId"],
					message: "thread parent is absent from the session snapshot",
				});
			}
		}
		const turnIds = new Set<string>();
		for (const [index, turn] of snapshot.activeTurns.entries()) {
			if (turn.sessionId !== sessionId) {
				context.addIssue({
					code: "custom",
					path: ["activeTurns", index, "sessionId"],
					message: "turn sessionId does not match snapshot session id",
				});
			}
			if (!threadsById.has(turn.threadId)) {
				context.addIssue({
					code: "custom",
					path: ["activeTurns", index, "threadId"],
					message: "turn thread is absent from the session snapshot",
				});
			}
			if (turn.status !== "accepted" && turn.status !== "running") {
				context.addIssue({
					code: "custom",
					path: ["activeTurns", index, "status"],
					message: "active turn must have an active status",
				});
			}
			if (turnIds.has(turn.id)) {
				context.addIssue({
					code: "custom",
					path: ["activeTurns", index, "id"],
					message: "duplicate turn id in session snapshot",
				});
			}
			turnIds.add(turn.id);
		}
		const permissionIds = new Set<string>();
		for (const [index, permission] of snapshot.pendingPermissions.entries()) {
			if (permission.sessionId !== sessionId) {
				context.addIssue({
					code: "custom",
					path: ["pendingPermissions", index, "sessionId"],
					message: "permission sessionId does not match snapshot session id",
				});
			}
			if (!threadsById.has(permission.threadId)) {
				context.addIssue({
					code: "custom",
					path: ["pendingPermissions", index, "threadId"],
					message: "permission thread is absent from the session snapshot",
				});
			}
			if (permissionIds.has(permission.id)) {
				context.addIssue({
					code: "custom",
					path: ["pendingPermissions", index, "id"],
					message: "duplicate permission id in session snapshot",
				});
			}
			permissionIds.add(permission.id);
		}
		const toolCallIds = new Set<string>();
		for (const [index, toolCall] of snapshot.openToolCalls.entries()) {
			if (toolCall.sessionId !== sessionId) {
				context.addIssue({
					code: "custom",
					path: ["openToolCalls", index, "sessionId"],
					message: "tool call sessionId does not match snapshot session id",
				});
			}
			if (toolCall.resolver.type !== "client") {
				context.addIssue({
					code: "custom",
					path: ["openToolCalls", index, "resolver", "type"],
					message: "client tool call must use a client resolver",
				});
			}
			if (!threadsById.has(toolCall.threadId)) {
				context.addIssue({
					code: "custom",
					path: ["openToolCalls", index, "threadId"],
					message: "tool call thread is absent from the session snapshot",
				});
			}
			if (toolCallIds.has(toolCall.id)) {
				context.addIssue({
					code: "custom",
					path: ["openToolCalls", index, "id"],
					message: "duplicate tool call id in session snapshot",
				});
			}
			toolCallIds.add(toolCall.id);
		}
		const eventIds = new Set<string>();
		for (const [index, event] of snapshot.recentEvents.entries()) {
			if (event.sessionId !== sessionId) {
				context.addIssue({
					code: "custom",
					path: ["recentEvents", index, "sessionId"],
					message: "recent event sessionId does not match snapshot session id",
				});
			}
			if (eventIds.has(event.id)) {
				context.addIssue({
					code: "custom",
					path: ["recentEvents", index, "id"],
					message: "duplicate event id in session snapshot",
				});
			}
			eventIds.add(event.id);
		}
		// The tail ends at the snapshot head: subscribing `after: head` must
		// yield exactly the events the snapshot has not already delivered.
		const lastRecent = snapshot.recentEvents.at(-1);
		if (lastRecent && lastRecent.cursor !== snapshot.head) {
			context.addIssue({
				code: "custom",
				path: ["head"],
				message: "head does not match the newest recent event cursor",
			});
		}
	});

/**
 * One patch mutation for everything mutable on a session: title, archive/
 * close lifecycle, and harness settings. Absent fields stay unchanged.
 * Settings fields are optional but NOT nullable: no current harness can
 * clear a model/mode/effort back to "unset", so accepting null would ack a
 * command whose advertised semantics the host cannot honor.
 */
export const updateSessionInputSchema = z
	.object({
		requestId: requestIdSchema,
		sessionId: sessionIdSchema,
		title: z.string().max(4_096).nullable().optional(),
		archived: z.boolean().optional(),
		closed: z.boolean().optional(),
		settings: z
			.object({
				activeModel: z.string().min(1).max(256).optional(),
				activeMode: z.string().min(1).max(256).optional(),
				effort: z.string().min(1).max(256).optional(),
			})
			.optional(),
	})
	.superRefine((input, context) => {
		if (
			input.title === undefined &&
			input.archived === undefined &&
			input.closed === undefined &&
			(input.settings === undefined ||
				(input.settings.activeModel === undefined &&
					input.settings.activeMode === undefined &&
					input.settings.effort === undefined))
		) {
			context.addIssue({
				code: "custom",
				path: [],
				message: "update must change at least one field",
			});
		}
	});

export const updateSessionReceiptSchema = z.object({
	requestId: requestIdSchema,
	sessionId: sessionIdSchema,
	status: z.literal("accepted"),
});

/**
 * Backwards-only scrollback over the durable-ish log. No cursor = the
 * newest window; page older by passing `range.oldest.cursor` back as
 * `beforeCursor`. Forward catch-up is the sync socket's job, never this
 * query's.
 */
export const getEventsInputSchema = z.object({
	sessionId: sessionIdSchema,
	threadId: threadIdSchema.optional(),
	beforeCursor: cursorSchema.optional(),
	limit: eventPageLimitSchema.optional(),
});

/** Identifies one end of a loaded history window. */
export const historyBoundarySchema = z.object({
	eventId: eventIdSchema,
	cursor: cursorSchema,
	occurredAt: timestampSchema,
});

export const eventsWindowSchema = z
	.object({
		sessionId: sessionIdSchema,
		threadId: threadIdSchema.nullable(),
		items: z.array(sessionEventSchema).max(100),
		range: z.object({
			oldest: historyBoundarySchema.nullable(),
			newest: historyBoundarySchema.nullable(),
			hasMoreBefore: z.boolean(),
			// True when the window reaches the oldest event the host retains but
			// earlier history existed and is irrecoverable (the source journal
			// evicted it before the host observed it). hasMoreBefore stays false —
			// paging back yields nothing — yet the log is not the full session.
			truncatedBefore: z.boolean(),
		}),
		head: cursorSchema,
	})
	.superRefine((window, context) => {
		const ids = new Set<string>();
		for (const [index, event] of window.items.entries()) {
			if (event.sessionId !== window.sessionId) {
				context.addIssue({
					code: "custom",
					path: ["items", index, "sessionId"],
					message: "event sessionId does not match window sessionId",
				});
			}
			if (window.threadId !== null && event.threadId !== window.threadId) {
				context.addIssue({
					code: "custom",
					path: ["items", index, "threadId"],
					message: "event threadId does not match window threadId",
				});
			}
			if (ids.has(event.id)) {
				context.addIssue({
					code: "custom",
					path: ["items", index, "id"],
					message: "duplicate event id in window",
				});
			}
			ids.add(event.id);
		}
		const first = window.items[0];
		const last = window.items.at(-1);
		const boundaryMatches = (
			boundary: { eventId: string; cursor: string; occurredAt: number } | null,
			item: (typeof window.items)[number],
		) =>
			boundary !== null &&
			boundary.eventId === item.id &&
			boundary.cursor === item.cursor &&
			boundary.occurredAt === item.occurredAt;
		if (first && !boundaryMatches(window.range.oldest, first)) {
			context.addIssue({
				code: "custom",
				path: ["range", "oldest"],
				message: "range.oldest does not identify the first (oldest) item",
			});
		}
		if (last && !boundaryMatches(window.range.newest, last)) {
			context.addIssue({
				code: "custom",
				path: ["range", "newest"],
				message: "range.newest does not identify the last (newest) item",
			});
		}
		if (
			window.items.length === 0 &&
			(window.range.oldest !== null || window.range.newest !== null)
		) {
			context.addIssue({
				code: "custom",
				path: ["range"],
				message: "an empty window cannot declare range boundaries",
			});
		}
		if (window.range.truncatedBefore && window.range.hasMoreBefore) {
			context.addIssue({
				code: "custom",
				path: ["range", "hasMoreBefore"],
				message: "a truncated window cannot also report more history before it",
			});
		}
	});

export const submitTurnInputSchema = z.object({
	requestId: requestIdSchema,
	sessionId: sessionIdSchema,
	threadId: threadIdSchema,
	content: z.array(contentBlockSchema).min(1).max(10_000),
});

export const submitTurnReceiptSchema = z.object({
	requestId: requestIdSchema,
	turnId: turnIdSchema,
	status: z.literal("accepted"),
});

export const cancelTurnInputSchema = z.object({
	requestId: requestIdSchema,
	sessionId: sessionIdSchema,
	turnId: turnIdSchema,
});

export const cancelTurnReceiptSchema = z.object({
	requestId: requestIdSchema,
	turnId: turnIdSchema,
	status: z.literal("accepted"),
});

export const resolvePermissionInputSchema = z.object({
	requestId: requestIdSchema,
	sessionId: sessionIdSchema,
	permissionId: permissionIdSchema,
	outcome: permissionOutcomeSchema,
});

export const resolvePermissionReceiptSchema = z.object({
	requestId: requestIdSchema,
	permissionId: permissionIdSchema,
	status: z.literal("accepted"),
});

/**
 * Client tools have no claim/lease step: the card renders on every capable
 * device and the first resolve to reach the host wins. Later resolves fail
 * with the host's stale-answer error and the losers' cards drain via the
 * `clientToolCallResolved` host event.
 */
export const resolveToolCallInputSchema = z.object({
	requestId: requestIdSchema,
	sessionId: sessionIdSchema,
	toolCallId: toolCallIdSchema,
	outcome: toolCallOutcomeSchema,
});

export const resolveToolCallReceiptSchema = z.object({
	requestId: requestIdSchema,
	toolCallId: toolCallIdSchema,
	status: z.literal("accepted"),
});

export type HostSnapshot = z.infer<typeof hostSnapshotSchema>;
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type CreateSessionResult = z.infer<typeof createSessionResultSchema>;
export type GetSessionInput = z.infer<typeof getSessionInputSchema>;
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;
export type UpdateSessionReceipt = z.infer<typeof updateSessionReceiptSchema>;
export type GetEventsInput = z.infer<typeof getEventsInputSchema>;
export type HistoryBoundary = z.infer<typeof historyBoundarySchema>;
export type EventsWindow = z.infer<typeof eventsWindowSchema>;
export type SubmitTurnInput = z.infer<typeof submitTurnInputSchema>;
export type SubmitTurnReceipt = z.infer<typeof submitTurnReceiptSchema>;
export type CancelTurnInput = z.infer<typeof cancelTurnInputSchema>;
export type CancelTurnReceipt = z.infer<typeof cancelTurnReceiptSchema>;
export type ResolvePermissionInput = z.infer<
	typeof resolvePermissionInputSchema
>;
export type ResolvePermissionReceipt = z.infer<
	typeof resolvePermissionReceiptSchema
>;
export type ResolveToolCallInput = z.infer<typeof resolveToolCallInputSchema>;
export type ResolveToolCallReceipt = z.infer<
	typeof resolveToolCallReceiptSchema
>;
