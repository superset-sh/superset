/**
 * Chat domain types for the v2 chat rebuild.
 *
 * Message -> Part -> Turn model. Ported conceptually from OpenCode
 * (temp/opencode/packages/sdk/js/src/v2/gen/types.gen.ts) and adapted for
 * the Superset desktop chat. See plans/20260421-v2-chat-opencode-rebuild.md §2.2.
 *
 * Principles:
 * - Parts are flat, keyed by messageID — not nested under a message.content array.
 * - Tool state is a discriminated union — no optional "isStreaming"/"isError" fields.
 * - Turns are a virtual grouping (UserMessage + AssistantMessages linked by parentID),
 *   not a persisted entity.
 */

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export type PartType =
	| "text"
	| "reasoning"
	| "tool"
	| "file"
	| "image"
	| "agent"
	| "compaction";

export interface BasePart {
	id: string;
	messageID: string;
	sessionID: string;
	time: { start: number; end?: number };
}

/**
 * Assistant or user text. Synthetic text parts carry embedded metadata
 * (e.g. review comments) that should not render as prose.
 */
export interface TextPart extends BasePart {
	type: "text";
	text: string;
	synthetic?: boolean;
}

/** Extended thinking / reasoning block. */
export interface ReasoningPart extends BasePart {
	type: "reasoning";
	text: string;
}

/**
 * Tool-call state. Every active tool call must be in exactly one of these
 * states — no optional flags.
 */
export type ToolState =
	| { kind: "input-streaming"; input: unknown }
	| { kind: "running"; input: unknown }
	| { kind: "completed"; input: unknown; output: unknown }
	| {
			kind: "error";
			input: unknown;
			error: { message: string };
			output?: unknown;
	  };

export interface ToolPart extends BasePart {
	type: "tool";
	tool: string; // "shell", "edit", "read", "task", "question", ...
	state: ToolState;
}

export interface FilePart extends BasePart {
	type: "file";
	path: string;
	url: string;
	mime: string;
	/** Optional line-range selection (inclusive). */
	selection?: { start: number; end: number };
}

export interface ImagePart extends BasePart {
	type: "image";
	mime: string;
	url: string;
	filename?: string;
}

export interface AgentPart extends BasePart {
	type: "agent";
	name: string;
}

/**
 * Emitted when the context window is compacted — the assistant is told
 * "earlier history was summarized, here is the summary." Rendered as a
 * divider in the timeline.
 */
export interface CompactionPart extends BasePart {
	type: "compaction";
	summary: string;
}

export type Part =
	| TextPart
	| ReasoningPart
	| ToolPart
	| FilePart
	| ImagePart
	| AgentPart
	| CompactionPart;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface UserMessage {
	id: string;
	sessionID: string;
	role: "user";
	time: { created: number };
	model?: { providerID: string; modelID: string };
	agent?: string;
}

export interface AssistantMessage {
	id: string;
	sessionID: string;
	role: "assistant";
	/** The user message this assistant message responds to. Defines the turn. */
	parentID: string;
	time: { created: number; completed?: number };
	modelID: string;
	providerID: string;
	error?: {
		message: string;
		kind?: "aborted" | "provider_auth" | "unknown";
	};
}

export type Message = UserMessage | AssistantMessage;
export type MessageRole = Message["role"];

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------

export type SessionStatus =
	| { type: "idle" }
	| { type: "busy" }
	| { type: "retry"; attempt: number; message: string; next: number };

// ---------------------------------------------------------------------------
// Turns (derived — never persisted)
// ---------------------------------------------------------------------------

/**
 * A turn is one user ask plus all assistant messages whose `parentID` points
 * at that user message. Derived client-side from flat message arrays — see
 * selectors.ts in the store.
 */
export interface Turn {
	user: UserMessage;
	assistant: AssistantMessage[];
	parts: { [messageID: string]: Part[] };
	/** True when this turn is the one currently being processed by the agent. */
	active: boolean;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isUserMessage(m: Message): m is UserMessage {
	return m.role === "user";
}

export function isAssistantMessage(m: Message): m is AssistantMessage {
	return m.role === "assistant";
}

export function isToolPart(p: Part): p is ToolPart {
	return p.type === "tool";
}

export function isTextPart(p: Part): p is TextPart {
	return p.type === "text";
}

export function isReasoningPart(p: Part): p is ReasoningPart {
	return p.type === "reasoning";
}
