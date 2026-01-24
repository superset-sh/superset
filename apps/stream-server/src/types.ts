/**
 * Stream event types for AI chat token streaming
 */

export interface TextDeltaEvent {
	type: "text_delta";
	text: string;
	timestamp: number;
}

export interface ToolUseStartEvent {
	type: "tool_use_start";
	toolName: string;
	toolId: string;
	timestamp: number;
}

export interface ToolUseDeltaEvent {
	type: "tool_use_delta";
	toolId: string;
	partialJson: string;
	timestamp: number;
}

export interface ToolUseEndEvent {
	type: "tool_use_end";
	toolId: string;
	timestamp: number;
}

export interface MessageCompleteEvent {
	type: "message_complete";
	inputTokens?: number;
	outputTokens?: number;
	timestamp: number;
}

export interface ErrorEvent {
	type: "error";
	error: string;
	timestamp: number;
}

export type StreamEvent =
	| TextDeltaEvent
	| ToolUseStartEvent
	| ToolUseDeltaEvent
	| ToolUseEndEvent
	| MessageCompleteEvent
	| ErrorEvent;

export interface StreamEntry {
	offset: number;
	event: StreamEvent;
}

export interface StreamState {
	sessionId: string;
	events: StreamEntry[];
	nextOffset: number;
	createdAt: number;
	updatedAt: number;
}

export interface PresenceUser {
	userId: string;
	name: string;
	isTyping: boolean;
	lastSeen: number;
}

export interface PresenceState {
	sessionId: string;
	users: Map<string, PresenceUser>;
}
