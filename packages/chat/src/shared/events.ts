/**
 * Sequenced chat stream events.
 *
 * Every event carries a `sequence: number` that increases monotonically per
 * session. The client's recovery coordinator (packages/chat/src/client/recovery.ts)
 * uses sequence numbers to detect gaps from disconnect/reorder and trigger
 * snapshot+replay. Ported conceptually from t3code's OrchestrationEvent model —
 * see temp/t3code/packages/contracts/src/orchestration.ts.
 *
 * Transport is tRPC observable over IPC (apps/desktop/AGENTS.md) or SSE for
 * web/mobile; this module is transport-agnostic.
 *
 * See plans/20260421-v2-chat-refactor-phased-plan.md Phase 0.1 and Phase 6.
 */

import type {
	AssistantMessage,
	Message,
	Part,
	SessionStatus,
	UserMessage,
} from "./types";

// ---------------------------------------------------------------------------
// Shared event envelope
// ---------------------------------------------------------------------------

export interface BaseChatStreamEvent {
	/** Monotonically increasing sequence number for the owning session. */
	sequence: number;
	sessionID: string;
	/** Server emission time (epoch ms). */
	at: number;
}

// ---------------------------------------------------------------------------
// Session-level events
// ---------------------------------------------------------------------------

/**
 * Full current state of a session. Emitted on subscribe and after reconnect
 * gap recovery. Replaces any local state the client had for this session.
 */
export interface SessionSnapshotEvent extends BaseChatStreamEvent {
	type: "session.snapshot";
	snapshot: {
		messages: Message[];
		parts: { [messageID: string]: Part[] };
		status: SessionStatus;
		/** Whether more history is available beyond the snapshot window. */
		historyMore: boolean;
	};
}

export interface SessionStatusEvent extends BaseChatStreamEvent {
	type: "session.status";
	status: SessionStatus;
}

// ---------------------------------------------------------------------------
// Message events
// ---------------------------------------------------------------------------

/**
 * A new user or assistant message starts. For the optimistic flow,
 * `optID` echoes the client-generated ID so it can replace the optimistic
 * placeholder. See plan §Phase 5.
 */
export interface MessageAppendEvent extends BaseChatStreamEvent {
	type: "message.append";
	message: UserMessage | AssistantMessage;
	/** Echo of the client-supplied optimistic ID, if any. */
	optID?: string;
}

// ---------------------------------------------------------------------------
// Part events
// ---------------------------------------------------------------------------

export interface PartAppendEvent extends BaseChatStreamEvent {
	type: "part.append";
	part: Part;
}

/**
 * Incremental update to a streaming part — text/reasoning delta, or tool
 * state transition (input-streaming → running → completed|error).
 */
export type PartDeltaEvent = BaseChatStreamEvent &
	(
		| { type: "part.delta"; partID: string; messageID: string; kind: "text"; delta: string }
		| {
				type: "part.delta";
				partID: string;
				messageID: string;
				kind: "reasoning";
				delta: string;
		  }
		| {
				type: "part.delta";
				partID: string;
				messageID: string;
				kind: "tool.input";
				inputDelta: unknown;
		  }
		| {
				type: "part.delta";
				partID: string;
				messageID: string;
				kind: "tool.state";
				state:
					| { kind: "running" }
					| { kind: "completed"; output: unknown }
					| { kind: "error"; error: { message: string }; output?: unknown };
		  }
	);

export interface PartCompleteEvent extends BaseChatStreamEvent {
	type: "part.complete";
	partID: string;
	messageID: string;
}

// ---------------------------------------------------------------------------
// Dock events (approvals/questions/plans/todos/revert/followup are docks,
// not timeline entries — see plan §4)
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
	id: string;
	toolCallID: string;
	toolName: string;
	args: unknown;
}

export interface QuestionRequest {
	id: string;
	question: string;
	options?: Array<{ label: string; description?: string }>;
	allowFreeText?: boolean;
}

export interface PlanApprovalRequest {
	id: string;
	planID: string;
	markdown: string;
}

export interface TodoItem {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed" | "cancelled";
}

export type DockEvent = BaseChatStreamEvent &
	(
		| { type: "dock.approval.set"; request: ApprovalRequest | null }
		| { type: "dock.question.set"; request: QuestionRequest | null }
		| { type: "dock.plan.set"; request: PlanApprovalRequest | null }
		| { type: "dock.todos"; todos: TodoItem[] }
		| { type: "dock.revert"; messageID: string | null }
	);

// ---------------------------------------------------------------------------
// Error events
// ---------------------------------------------------------------------------

export interface ErrorEvent extends BaseChatStreamEvent {
	type: "error";
	messageID?: string;
	error: { message: string; kind?: "aborted" | "provider_auth" | "unknown" };
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export type ChatStreamEvent =
	| SessionSnapshotEvent
	| SessionStatusEvent
	| MessageAppendEvent
	| PartAppendEvent
	| PartDeltaEvent
	| PartCompleteEvent
	| DockEvent
	| ErrorEvent;

export type ChatStreamEventType = ChatStreamEvent["type"];

// ---------------------------------------------------------------------------
// Sequenced event helper — the recovery coordinator accepts anything with
// a sequence number, so we expose the minimal interface separately for
// reuse in tests and adapters.
// ---------------------------------------------------------------------------

export interface Sequenced {
	sequence: number;
}

export function isSequenced(x: unknown): x is Sequenced {
	return (
		typeof x === "object" &&
		x !== null &&
		"sequence" in x &&
		typeof (x as { sequence: unknown }).sequence === "number"
	);
}
