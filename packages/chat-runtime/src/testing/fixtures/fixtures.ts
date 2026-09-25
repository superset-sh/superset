import type {
	AgentMessage,
	ApprovalRequest,
	Reasoning,
	SessionState,
	ToolCall,
	Turn,
	UserMessage,
} from "@superset/chat/protocol";

export function sessionState(
	overrides: Partial<SessionState> = {},
): SessionState {
	return { status: "running", harness: "fake", ...overrides };
}

export function turn(id: string, overrides: Partial<Turn> = {}): Turn {
	return { id, status: "running", startedAtMs: 1, ...overrides };
}

export function userMessage(
	id: string,
	text: string,
	overrides: Partial<UserMessage> = {},
): UserMessage {
	return {
		id,
		kind: "user_message",
		startedAtMs: 1,
		content: [{ type: "text", text }],
		...overrides,
	};
}

export function agentMessage(id: string, text: string): AgentMessage {
	return { id, kind: "agent_message", startedAtMs: 1, text };
}

export function reasoning(id: string, text: string): Reasoning {
	return { id, kind: "reasoning", startedAtMs: 1, text };
}

export function toolCall(
	id: string,
	overrides: Partial<ToolCall> = {},
): ToolCall {
	return {
		id,
		kind: "tool_call",
		startedAtMs: 1,
		title: "Running ls",
		toolKind: "execute",
		toolName: "Bash",
		status: "running",
		content: [],
		...overrides,
	};
}

export function approvalRequest(
	id: string,
	overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
	return {
		id,
		kind: "approval_request",
		startedAtMs: 1,
		targetItemId: null,
		title: "Allow ls?",
		status: "pending",
		...overrides,
	};
}
