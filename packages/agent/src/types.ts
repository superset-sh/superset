import type { StreamChunk } from "@tanstack/ai";

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export interface ExecuteAgentParams {
	/** Unique session identifier */
	sessionId: string;

	/** User prompt/message */
	prompt: string;

	/** Working directory for the agent */
	cwd: string;

	/** Environment variables (must include ANTHROPIC_API_KEY) */
	env: Record<string, string>;

	/** Model to use (defaults to claude-sonnet-4-5-20250929) */
	model?: string;

	/** Permission mode for tool usage */
	permissionMode?: PermissionMode;

	/** Resume from previous session */
	resume?: boolean;

	/** Allowed tools (whitelist) */
	allowedTools?: string[];

	/** Disallowed tools (blacklist) */
	disallowedTools?: string[];

	/** Maximum budget in USD */
	maxBudgetUsd?: number;

	/** Maximum thinking tokens */
	maxThinkingTokens?: number;

	/** Fallback model if primary fails */
	fallbackModel?: string;

	/** Additional directories to grant access */
	additionalDirectories?: string[];

	/** Beta features to enable */
	betas?: string[];

	/** Path to the Claude Code executable */
	pathToClaudeCodeExecutable?: string;

	/** Abort signal for cancellation */
	signal?: AbortSignal;

	/** Callback for each stream chunk */
	onChunk?: (chunk: StreamChunk) => Promise<void> | void;

	/** Callback for permission requests */
	onPermissionRequest?: (
		params: PermissionRequestParams,
	) => Promise<PermissionResult>;

	/** Callback for system events */
	onEvent?: (event: AgentEvent) => void;
}

export interface PermissionRequestParams {
	toolUseId: string;
	toolName: string;
	input: Record<string, unknown>;
	signal: AbortSignal;
}

export type PermissionResult =
	| { behavior: "allow"; updatedInput: Record<string, unknown> }
	| { behavior: "deny"; message: string };

export interface ExecuteAgentResult {
	success: boolean;
	error?: string;
	messageId: string;
	runId: string;
}

export type AgentEvent =
	| { type: "session_initialized"; sessionId: string; claudeSessionId: string }
	| { type: "chunk_sent"; chunk: StreamChunk }
	| { type: "error"; error: Error }
	| { type: "completed" };
