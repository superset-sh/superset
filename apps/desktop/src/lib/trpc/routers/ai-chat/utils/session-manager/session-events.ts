export interface SessionStartEvent {
	type: "session_start";
	sessionId: string;
}

export interface SessionEndEvent {
	type: "session_end";
	sessionId: string;
	exitCode: number | null;
}

export interface ErrorEvent {
	type: "error";
	sessionId: string;
	error: string;
}

export interface PermissionRequestEvent {
	type: "permission_request";
	sessionId: string;
	toolUseId: string;
	toolName: string;
	input: Record<string, unknown>;
}

export type ClaudeStreamEvent =
	| SessionStartEvent
	| SessionEndEvent
	| ErrorEvent
	| PermissionRequestEvent;
