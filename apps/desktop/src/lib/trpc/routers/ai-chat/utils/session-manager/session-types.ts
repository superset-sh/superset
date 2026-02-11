export interface ActiveSession {
	sessionId: string;
	cwd: string;
	model?: string;
	permissionMode?: string;
	maxThinkingTokens?: number;
}

export interface EnsureSessionReadyInput {
	sessionId: string;
	cwd: string;
	model?: string;
	permissionMode?: string;
	maxThinkingTokens?: number;
}
