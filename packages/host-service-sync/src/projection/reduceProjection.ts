import type {
	SessionEvent,
	Thread,
	ThreadRunState,
	ToolCall,
	ToolCallUpdate,
	TurnId,
} from "../protocol";
import {
	ProjectionError,
	type ProjectionInput,
	type SessionProjection,
} from "./projection";

const TERMINAL_TOOL_CALL_STATES: ReadonlySet<ToolCall["state"]> = new Set([
	"succeeded",
	"failed",
	"cancelled",
]);

/**
 * The one pure projection reducer shared by host projection and client
 * folding. Callers guarantee inputs are schema-validated, ordered, and
 * deduplicated by event id; replay overlap is safe because entity-reference
 * updates for unknown ids are idempotent no-ops.
 *
 * Semantics the event stream cannot express are out of scope: runState only
 * toggles between running/idle from turn lifecycle here, while host-liveness
 * states (starting, offline, cancelling, closed) enter via snapshots.
 */
export function reduceProjection(
	current: SessionProjection | null,
	input: ProjectionInput,
): SessionProjection {
	if (input.type === "snapshot") {
		if (current !== null && current.sessionId !== input.value.sessionId) {
			throw new ProjectionError(
				"PROJECTION_SESSION_MISMATCH",
				"snapshot belongs to a different session than the current projection",
			);
		}
		return input.value;
	}
	if (current === null) {
		throw new ProjectionError(
			"PROJECTION_NOT_INITIALIZED",
			"cannot fold an event before a snapshot initializes the projection",
		);
	}
	const event = input.value;
	if (event.sessionId !== current.sessionId) {
		throw new ProjectionError(
			"PROJECTION_SESSION_MISMATCH",
			"event belongs to a different session than the current projection",
		);
	}

	const next: SessionProjection = {
		...current,
		cursor: input.cursor,
		session: {
			...current.session,
			eventHead: event.cursor,
			updatedAt: event.occurredAt,
			lastActivityAt: event.occurredAt,
		},
		threadsById: { ...current.threadsById },
		activeTurnsById: { ...current.activeTurnsById },
		pendingPermissionsById: { ...current.pendingPermissionsById },
		activeToolCallsById: { ...current.activeToolCallsById },
	};

	const payload = event.payload;
	switch (payload.type) {
		case "threadCreated":
		case "threadUpdated":
			next.threadsById[payload.thread.id] = payload.thread;
			break;
		case "turnStarted":
			next.activeTurnsById[payload.turn.id] = payload.turn;
			next.session.runState = "running";
			// A newly accepted turn supersedes any earlier surfaced error.
			next.session.error = null;
			setThreadRunState(next, event.threadId, "running");
			break;
		case "turnCompleted":
			finishTurn(next, payload.turnId, event.threadId, "completed");
			break;
		case "turnCancelled":
			finishTurn(next, payload.turnId, event.threadId, "cancelled");
			break;
		case "turnFailed":
			finishTurn(next, payload.turnId, event.threadId, "failed");
			next.session.error = payload.error;
			break;
		case "messageStarted":
		case "messageDelta":
		case "messageCompleted":
			// Transcript bodies live in the event log, not the projection.
			break;
		case "toolCallStarted":
			if (!TERMINAL_TOOL_CALL_STATES.has(payload.toolCall.state)) {
				next.activeToolCallsById[payload.toolCall.id] = payload.toolCall;
			}
			break;
		case "toolCallUpdated": {
			const existing = next.activeToolCallsById[payload.toolCallId];
			if (!existing) break;
			const updated = applyToolCallUpdate(existing, payload.update);
			if (TERMINAL_TOOL_CALL_STATES.has(updated.state)) {
				delete next.activeToolCallsById[payload.toolCallId];
			} else {
				next.activeToolCallsById[payload.toolCallId] = updated;
			}
			break;
		}
		case "permissionRequested":
			next.pendingPermissionsById[payload.permission.id] = payload.permission;
			break;
		case "permissionResolved":
			delete next.pendingPermissionsById[payload.permissionId];
			break;
		case "planUpdated":
			next.plan = payload.plan;
			break;
		case "settingsUpdated":
			next.session.settings = payload.settings;
			break;
		case "error":
			next.session.error = payload.error;
			break;
		default:
			payload satisfies never;
	}

	touchThread(next, event.threadId, event);
	if (
		next.session.runState === "running" &&
		Object.keys(next.activeTurnsById).length === 0
	) {
		next.session.runState = "idle";
	}
	return next;
}

function finishTurn(
	projection: SessionProjection,
	turnId: TurnId,
	threadId: string,
	threadRunState: ThreadRunState,
): void {
	// Replay overlap safety: a terminal event for a turn this projection never
	// tracked must be a full no-op, or it would terminalize a live thread.
	if (!projection.activeTurnsById[turnId]) return;
	delete projection.activeTurnsById[turnId];
	setThreadRunState(projection, threadId, threadRunState);
}

function setThreadRunState(
	projection: SessionProjection,
	threadId: string,
	runState: ThreadRunState,
): void {
	const thread = projection.threadsById[threadId];
	if (!thread) return;
	projection.threadsById[threadId] = { ...thread, runState };
}

function touchThread(
	projection: SessionProjection,
	threadId: string,
	event: SessionEvent,
): void {
	const thread = projection.threadsById[threadId];
	if (!thread) return;
	projection.threadsById[threadId] = {
		...thread,
		eventHead: event.cursor,
		updatedAt: event.occurredAt,
		lastActivityAt: event.occurredAt,
	} satisfies Thread;
}

function applyToolCallUpdate(
	toolCall: ToolCall,
	update: ToolCallUpdate,
): ToolCall {
	return {
		...toolCall,
		// `output` intentionally has no home here: outcomes live in the log.
		...(update.title !== undefined ? { title: update.title } : {}),
		...(update.input !== undefined ? { input: update.input } : {}),
		...(update.state !== undefined ? { state: update.state } : {}),
		updatedAt: update.updatedAt,
	};
}
