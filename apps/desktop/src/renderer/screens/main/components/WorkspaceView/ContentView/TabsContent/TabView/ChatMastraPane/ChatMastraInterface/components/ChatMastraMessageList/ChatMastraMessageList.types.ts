import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";

export type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];

export type MastraActiveTools = NonNullable<
	UseMastraChatDisplayReturn["activeTools"]
>;

export type MastraToolInputBuffers = NonNullable<
	UseMastraChatDisplayReturn["toolInputBuffers"]
>;

export type MastraActiveSubagents = NonNullable<
	UseMastraChatDisplayReturn["activeSubagents"]
>;

export type MastraActiveSubagent =
	MastraActiveSubagents extends Map<string, infer SubagentState>
		? SubagentState
		: never;

export type MastraActiveTool =
	MastraActiveTools extends Map<string, infer ToolState> ? ToolState : never;

export type MastraToolInputBuffer =
	MastraToolInputBuffers extends Map<string, infer InputBuffer>
		? InputBuffer
		: never;

export type MastraPendingApproval =
	UseMastraChatDisplayReturn["pendingApproval"];

export type MastraPendingPlanApproval =
	UseMastraChatDisplayReturn["pendingPlanApproval"];

export type MastraPendingQuestion =
	UseMastraChatDisplayReturn["pendingQuestion"];

export interface InterruptedMessagePreview {
	id: string;
	sourceMessageId: string;
	content: MastraMessage["content"];
}

export interface UserMessageActionPayload {
	content: string;
	files?: Array<{
		data: string;
		mediaType: string;
		filename?: string;
		uploaded: false;
	}>;
}

export interface UserMessageRestartRequest {
	messageId: string;
	prefixMessages: MastraMessage[];
	payload: UserMessageActionPayload;
}

export interface ChatMastraMessageListProps {
	messages: MastraMessage[];
	isFocused: boolean;
	isRunning: boolean;
	isConversationLoading: boolean;
	isAwaitingAssistant: boolean;
	currentMessage: MastraMessage | null;
	interruptedMessage: InterruptedMessagePreview | null;
	workspaceId: string;
	sessionId: string | null;
	organizationId: string | null;
	workspaceCwd?: string;
	activeTools: MastraActiveTools | undefined;
	toolInputBuffers: MastraToolInputBuffers | undefined;
	activeSubagents: MastraActiveSubagents | undefined;
	pendingApproval: MastraPendingApproval;
	isApprovalSubmitting: boolean;
	onApprovalRespond: (
		decision: "approve" | "decline" | "always_allow_category",
	) => Promise<void>;
	pendingPlanApproval: MastraPendingPlanApproval;
	isPlanSubmitting: boolean;
	onPlanRespond: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
	pendingQuestion: MastraPendingQuestion;
	isQuestionSubmitting: boolean;
	onQuestionRespond: (questionId: string, answer: string) => Promise<void>;
	editingUserMessageId: string | null;
	isEditSubmitting: boolean;
	onStartEditUserMessage: (messageId: string) => void;
	onCancelEditUserMessage: () => void;
	onSubmitEditedUserMessage: (
		request: UserMessageRestartRequest,
	) => Promise<void>;
	onRestartUserMessage: (request: UserMessageRestartRequest) => Promise<void>;
}
