/**
 * Shared types for AI chat
 */

export interface StreamTextDeltaEvent {
	type: "text_delta";
	text: string;
	timestamp: number;
}

export interface StreamToolUseStartEvent {
	type: "tool_use_start";
	toolName: string;
	toolId: string;
	timestamp: number;
}

export interface StreamToolUseDeltaEvent {
	type: "tool_use_delta";
	toolId: string;
	partialJson: string;
	timestamp: number;
}

export interface StreamToolUseEndEvent {
	type: "tool_use_end";
	toolId: string;
	timestamp: number;
}

export interface StreamMessageCompleteEvent {
	type: "message_complete";
	inputTokens?: number;
	outputTokens?: number;
	timestamp: number;
}

export interface StreamErrorEvent {
	type: "error";
	error: string;
	timestamp: number;
}

export interface StreamSessionStartEvent {
	type: "session_start";
	timestamp: number;
}

export interface StreamSessionEndEvent {
	type: "session_end";
	exitCode: number | null;
	timestamp: number;
}

export type StreamEvent =
	| StreamTextDeltaEvent
	| StreamToolUseStartEvent
	| StreamToolUseDeltaEvent
	| StreamToolUseEndEvent
	| StreamMessageCompleteEvent
	| StreamErrorEvent
	| StreamSessionStartEvent
	| StreamSessionEndEvent;

export interface StreamEntry {
	offset: number;
	event: StreamEvent;
}

export interface PresenceUser {
	userId: string;
	name: string;
	image?: string;
}

export interface PresenceState {
	viewers: PresenceUser[];
	typingUsers: PresenceUser[];
}

export interface Draft {
	userId: string;
	userName: string;
	content: string;
	updatedAt: number;
}

export interface ChatMessage {
	id: string;
	sessionId: string;
	role: "user" | "assistant";
	content: string;
	toolCalls?: unknown[];
	inputTokens?: number;
	outputTokens?: number;
	createdById: string;
	createdAt: Date;
}

export interface ChatSession {
	id: string;
	organizationId: string;
	repositoryId?: string | null;
	workspaceId?: string | null;
	title: string;
	claudeSessionId?: string | null;
	cwd?: string | null;
	createdById: string;
	archivedAt?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}
