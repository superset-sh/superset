export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export interface ChatInterfaceProps {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	paneId: string;
	tabId: string;
}

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface ToolApprovalRequest {
	runId: string;
	toolCallId: string;
	toolName: string;
	args: unknown;
}

export interface TextPart {
	type: "text";
	text: string;
}

export interface ToolCallPart {
	type: "tool-call";
	toolCallId: string;
	toolName: string;
	args: unknown;
	status: "streaming" | "calling" | "done";
	result?: unknown;
	isError?: boolean;
}

export interface AgentCallPart {
	type: "agent-call";
	toolCallId: string;
	agentName: string;
	prompt: string;
	status: "running" | "done";
	parts: MessagePart[];
	result?: string;
}

export type MessagePart = TextPart | ToolCallPart | AgentCallPart;

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	parts: MessagePart[];
}

export type WsToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

export interface MastraChunk {
	type: string;
	payload?: {
		text?: string;
		toolCallId?: string;
		toolName?: string;
		args?: unknown;
		argsTextDelta?: string;
		result?: unknown;
		isError?: boolean;
		output?: unknown;
		error?: unknown;
	};
}
