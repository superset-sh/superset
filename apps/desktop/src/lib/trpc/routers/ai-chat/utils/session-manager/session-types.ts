export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export interface ActiveSession {
	sessionId: string;
	cwd: string;
	model?: string;
	permissionMode?: PermissionMode;
	maxThinkingTokens?: number;
}

export interface EnsureSessionReadyInput {
	sessionId: string;
	cwd: string;
	model?: string;
	permissionMode?: PermissionMode;
	maxThinkingTokens?: number;
}
