export type ChatThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

export interface ChatSendMessageInput {
	sessionId: string;
	workspaceId: string;
	payload: ChatMessagePayload;
	metadata?: {
		model?: string;
		thinkingLevel?: ChatThinkingLevel;
	};
}

export interface ChatMessagePayload {
	content: string;
	files?: Array<{
		data: string;
		mediaType: string;
		filename?: string;
	}>;
}

export interface RestartPayload extends ChatSendMessageInput {
	messageId: string;
}

export interface ChatPendingQuestionOption {
	label: string;
	description?: string;
}

export interface ChatPendingQuestion {
	questionId: string;
	question: string;
	description?: string;
	options: ChatPendingQuestionOption[];
}

export interface ChatApprovalPayload {
	decision: "approve" | "decline" | "always_allow_category";
}

export interface ChatQuestionPayload {
	questionId: string;
	answer: string;
}

export interface ChatPlanPayload {
	planId: string;
	response: {
		action: "approved" | "rejected";
		feedback?: string;
	};
}

export type ChatRole = "user" | "assistant";

export interface ChatTextPart {
	type: "text";
	text: string;
}

export interface ChatThinkingPart {
	type: "thinking";
	thinking: string;
}

export interface ChatFilePart {
	type: "file";
	data: string;
	mediaType: string;
	filename?: string;
}

export interface ChatImagePart {
	type: "image";
	data: string;
	mimeType: string;
}

export interface ChatToolCallPart {
	type: "tool_call";
	id: string;
	name: string;
	args: unknown;
}

export interface ChatToolResultPart {
	type: "tool_result";
	id: string;
	name: string;
	result: unknown;
	isError?: boolean;
}

export type ChatMessagePart =
	| ChatTextPart
	| ChatThinkingPart
	| ChatFilePart
	| ChatImagePart
	| ChatToolCallPart
	| ChatToolResultPart;

export interface ChatMessage {
	id: string;
	role: ChatRole;
	content: ChatMessagePart[];
	createdAt: Date;
	stopReason?: string;
	errorMessage?: string;
}

export interface ChatPendingApproval {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

export interface ChatDisplayState {
	isRunning: boolean;
	currentMessage: ChatMessage | null;
	pendingApproval: ChatPendingApproval | null;
	pendingPlanApproval: null;
	pendingQuestion: ChatPendingQuestion | null;
	activeTools: Map<string, unknown>;
	toolInputBuffers: Map<string, unknown>;
	activeSubagents: Map<string, unknown>;
	errorMessage: string | null;
}

export interface ChatSnapshot {
	displayState: ChatDisplayState;
	messages: ChatMessage[];
}
