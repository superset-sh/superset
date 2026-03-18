import { describe, expect, it, mock } from "bun:test";
import { forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@superset/ui/ai-elements/conversation", () => ({
	Conversation: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	ConversationContent: forwardRef<
		HTMLDivElement,
		{ children: React.ReactNode }
	>(({ children }, ref) => <div ref={ref}>{children}</div>),
	ConversationLoadingState: ({ label }: { label?: string }) => (
		<div>{label ?? "Loading conversation..."}</div>
	),
	ConversationEmptyState: ({ title }: { title?: string }) => (
		<div>{title ?? "Empty"}</div>
	),
	ConversationScrollButton: () => null,
}));

mock.module("@superset/ui/ai-elements/message", () => ({
	Message: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	MessageContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

mock.module("@superset/ui/ai-elements/shimmer-label", () => ({
	ShimmerLabel: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}));

mock.module(
	"renderer/components/Chat/ChatInterface/components/ToolCallBlock",
	() => ({
		ToolCallBlock: () => null,
	}),
);

mock.module("./components/AssistantMessage", () => ({
	AssistantMessage: ({
		message,
		footer,
	}: {
		message: {
			id: string;
			content: Array<{ type: string; text?: string }>;
		};
		footer?: React.ReactNode;
	}) => (
		<div data-assistant-id={message.id}>
			{message.content
				.filter((part) => part.type === "text")
				.map((part, index) => (
					<span key={`${message.id}-${index}`}>{part.text}</span>
				))}
			{footer}
		</div>
	),
}));

mock.module("./components/UserMessage", () => ({
	UserMessage: ({
		message,
	}: {
		message: {
			id: string;
			content: Array<{ type: string; text?: string }>;
		};
	}) => (
		<div data-user-id={message.id}>
			{message.content
				.filter((part) => part.type === "text")
				.map((part, index) => (
					<span key={`${message.id}-${index}`}>{part.text}</span>
				))}
		</div>
	),
}));

mock.module("./components/MessageScrollbackRail", () => ({
	MessageScrollbackRail: ({
		messages,
	}: {
		messages: Array<{ id: string }>;
	}) => <div data-rail-count={messages.length} />,
}));

mock.module("./components/SubagentExecutionMessage", () => ({
	SubagentExecutionMessage: () => <div>SUBAGENT_EXECUTION_MESSAGE</div>,
}));

mock.module("./components/PendingApprovalMessage", () => ({
	PendingApprovalMessage: () => null,
}));

mock.module("./components/PendingPlanApprovalMessage", () => ({
	PendingPlanApprovalMessage: () => <div>PENDING_PLAN_APPROVAL_MESSAGE</div>,
}));

mock.module("./components/PendingQuestionMessage", () => ({
	PendingQuestionMessage: () => null,
}));

mock.module("./components/ToolPreviewMessage", () => ({
	ToolPreviewMessage: ({
		pendingPlanToolCallId,
	}: {
		pendingPlanToolCallId?: string | null;
	}) => (
		<div data-pending-plan-tool-call-id={pendingPlanToolCallId ?? ""}>
			TOOL_PREVIEW_MESSAGE
		</div>
	),
}));

mock.module("./hooks/useChatMessageSearch", () => ({
	useChatMessageSearch: () => ({
		isSearchOpen: false,
		query: "",
		caseSensitive: false,
		matchCount: 0,
		activeMatchIndex: 0,
		setQuery: () => {},
		setCaseSensitive: () => {},
		findNext: () => {},
		findPrevious: () => {},
		closeSearch: () => {},
	}),
}));

const { ChatMessageList } = await import("./ChatMessageList");
type ChatMessageListProps = Parameters<typeof ChatMessageList>[0];

type TestMessage = {
	id: string;
	role: "user" | "assistant";
	content: Array<{ type: "text"; text: string }>;
	createdAt: Date;
};

function testMessage(
	id: string,
	role: TestMessage["role"],
	text: string,
	createdAt: string,
): TestMessage {
	return {
		id,
		role,
		content: [{ type: "text", text }],
		createdAt: new Date(createdAt),
	};
}

function createBaseProps(
	overrides: Partial<ChatMessageListProps> = {},
): ChatMessageListProps {
	return {
		messages: [] as never,
		isFocused: true,
		isRunning: false,
		isConversationLoading: false,
		isAwaitingAssistant: false,
		currentMessage: null,
		interruptedMessage: null,
		workspaceId: "workspace-1",
		sessionId: "session-1",
		organizationId: "org-1",
		workspaceCwd: "/repo",
		activeTools: undefined,
		toolInputBuffers: undefined,
		activeSubagents: undefined,
		pendingApproval: null,
		isApprovalSubmitting: false,
		onApprovalRespond: async () => {},
		pendingPlanApproval: null,
		isPlanSubmitting: false,
		onPlanRespond: async () => {},
		pendingQuestion: null,
		isQuestionSubmitting: false,
		onQuestionRespond: async () => {},
		editingUserMessageId: null,
		isEditSubmitting: false,
		onStartEditUserMessage: () => {},
		onCancelEditUserMessage: () => {},
		onSubmitEditedUserMessage: async () => {},
		onRestartUserMessage: async () => {},
		...overrides,
	};
}

function renderListHtml(overrides: Partial<ChatMessageListProps> = {}): string {
	return renderToStaticMarkup(
		<ChatMessageList {...createBaseProps(overrides)} />,
	);
}

describe("ChatMessageList", () => {
	it("shows loading state while conversation history is loading", () => {
		const html = renderListHtml({
			isConversationLoading: true,
		});

		expect(html).toContain("Loading conversation...");
		expect(html).not.toContain("Start a conversation");
	});

	it("shows interrupted preview content after stop and hides the source assistant message", () => {
		const html = renderListHtml({
			messages: [
				testMessage(
					"user-1",
					"user",
					"first user prompt",
					"2026-03-03T00:00:00.000Z",
				),
				testMessage(
					"assistant-1",
					"assistant",
					"persisted assistant text",
					"2026-03-03T00:00:01.000Z",
				),
			] as never,
			interruptedMessage: {
				id: "interrupted:assistant-1",
				sourceMessageId: "assistant-1",
				content: [{ type: "text", text: "interrupted snapshot text" }],
			} as never,
		});

		expect(html).toContain("first user prompt");
		expect(html).toContain("interrupted snapshot text");
		expect(html).toContain("Interrupted");
		expect(html).toContain("Response stopped");
		expect(html).not.toContain("persisted assistant text");
	});

	it("does not show interrupted preview while a response is still running", () => {
		const html = renderListHtml({
			messages: [
				testMessage(
					"user-1",
					"user",
					"first user prompt",
					"2026-03-03T00:00:00.000Z",
				),
				testMessage(
					"assistant-1",
					"assistant",
					"persisted assistant text",
					"2026-03-03T00:00:01.000Z",
				),
			] as never,
			isRunning: true,
			isAwaitingAssistant: true,
			currentMessage: testMessage(
				"assistant-current",
				"assistant",
				"streaming assistant text",
				"2026-03-03T00:00:02.000Z",
			) as never,
			interruptedMessage: {
				id: "interrupted:assistant-1",
				sourceMessageId: "assistant-1",
				content: [{ type: "text", text: "interrupted snapshot text" }],
			} as never,
		});

		expect(html).toContain("streaming assistant text");
		expect(html).not.toContain("interrupted snapshot text");
		expect(html).not.toContain("Interrupted");
		expect(html).not.toContain("Response stopped");
	});

	it("renders subagent activity while keeping anchored pending plan inline", () => {
		const html = renderListHtml({
			messages: [
				{
					id: "assistant-plan-1",
					role: "assistant",
					content: [
						{
							type: "tool_call",
							id: "tool-call-1",
							name: "submit_plan",
							args: {},
						},
					],
					createdAt: new Date("2026-03-03T00:00:01.000Z"),
				},
			] as never,
			activeSubagents: new Map([
				[
					"tool-call-1",
					{
						status: "running",
						task: "Run tests",
					},
				],
			]) as never,
			pendingPlanApproval: {
				planId: "tool-call-1",
				title: "Implementation plan",
				plan: "Do the thing",
			} as never,
		});

		expect(html).toContain("SUBAGENT_EXECUTION_MESSAGE");
		expect(html).not.toContain("PENDING_PLAN_APPROVAL_MESSAGE");
	});

	it("shows tool preview while awaiting assistant when pending plan is anchored", () => {
		const html = renderListHtml({
			isAwaitingAssistant: true,
			activeTools: new Map([
				[
					"tool-call-1",
					{
						name: "submit_plan",
						status: "streaming_input",
					},
				],
			]) as never,
			pendingPlanApproval: {
				toolCallId: "tool-call-1",
				title: "Implementation plan",
				plan: "Do the thing",
			} as never,
		});

		expect(html).toContain("TOOL_PREVIEW_MESSAGE");
		expect(html).not.toContain("PENDING_PLAN_APPROVAL_MESSAGE");
	});

	it("does not render standalone pending plan when anchored from interrupted preview", () => {
		const html = renderListHtml({
			messages: [
				{
					id: "assistant-1",
					role: "assistant",
					content: [
						{
							type: "tool_call",
							id: "tool-call-interrupted",
							name: "submit_plan",
							args: {},
						},
					],
					createdAt: new Date("2026-03-03T00:00:01.000Z"),
				},
			] as never,
			interruptedMessage: {
				id: "interrupted:assistant-1",
				sourceMessageId: "assistant-1",
				content: [
					{
						type: "tool_call",
						id: "tool-call-interrupted",
						name: "submit_plan",
						args: {},
					},
				],
			} as never,
			pendingPlanApproval: {
				title: "Implementation plan",
				plan: "Do the thing",
			} as never,
		});

		expect(html).not.toContain("PENDING_PLAN_APPROVAL_MESSAGE");
	});
});
