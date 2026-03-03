import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@superset/ui/ai-elements/conversation", () => ({
	Conversation: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	ConversationContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
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
	"../../../../ChatPane/ChatInterface/components/MastraToolCallBlock",
	() => ({
		MastraToolCallBlock: () => null,
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
	SubagentExecutionMessage: () => null,
}));

mock.module("./components/PendingApprovalMessage", () => ({
	PendingApprovalMessage: () => null,
}));

mock.module("./components/PendingPlanApprovalMessage", () => ({
	PendingPlanApprovalMessage: () => null,
}));

mock.module("./components/PendingQuestionMessage", () => ({
	PendingQuestionMessage: () => null,
}));

const { ChatMastraMessageList } = await import("./ChatMastraMessageList");

describe("ChatMastraMessageList", () => {
	it("shows interrupted preview content after stop and hides the source assistant message", () => {
		const html = renderToStaticMarkup(
			<ChatMastraMessageList
				messages={
					[
						{
							id: "user-1",
							role: "user",
							content: [{ type: "text", text: "first user prompt" }],
							createdAt: new Date("2026-03-03T00:00:00.000Z"),
						},
						{
							id: "assistant-1",
							role: "assistant",
							content: [{ type: "text", text: "persisted assistant text" }],
							createdAt: new Date("2026-03-03T00:00:01.000Z"),
						},
					] as never
				}
				isRunning={false}
				isAwaitingAssistant={false}
				currentMessage={null}
				interruptedMessage={
					{
						id: "interrupted:assistant-1",
						sourceMessageId: "assistant-1",
						content: [{ type: "text", text: "interrupted snapshot text" }],
					} as never
				}
				workspaceId="workspace-1"
				sessionId="session-1"
				organizationId="org-1"
				workspaceCwd="/repo"
				activeTools={undefined}
				toolInputBuffers={undefined}
				activeSubagents={undefined}
				pendingApproval={null}
				isApprovalSubmitting={false}
				onApprovalRespond={async () => {}}
				pendingPlanApproval={null}
				isPlanSubmitting={false}
				onPlanRespond={async () => {}}
				pendingQuestion={null}
				isQuestionSubmitting={false}
				onQuestionRespond={async () => {}}
			/>,
		);

		expect(html).toContain("first user prompt");
		expect(html).toContain("interrupted snapshot text");
		expect(html).toContain("Interrupted");
		expect(html).toContain("Response stopped");
		expect(html).not.toContain("persisted assistant text");
	});

	it("does not show interrupted preview while a response is still running", () => {
		const html = renderToStaticMarkup(
			<ChatMastraMessageList
				messages={
					[
						{
							id: "user-1",
							role: "user",
							content: [{ type: "text", text: "first user prompt" }],
							createdAt: new Date("2026-03-03T00:00:00.000Z"),
						},
						{
							id: "assistant-1",
							role: "assistant",
							content: [{ type: "text", text: "persisted assistant text" }],
							createdAt: new Date("2026-03-03T00:00:01.000Z"),
						},
					] as never
				}
				isRunning
				isAwaitingAssistant
				currentMessage={
					{
						id: "assistant-current",
						role: "assistant",
						content: [{ type: "text", text: "streaming assistant text" }],
						createdAt: new Date("2026-03-03T00:00:02.000Z"),
					} as never
				}
				interruptedMessage={
					{
						id: "interrupted:assistant-1",
						sourceMessageId: "assistant-1",
						content: [{ type: "text", text: "interrupted snapshot text" }],
					} as never
				}
				workspaceId="workspace-1"
				sessionId="session-1"
				organizationId="org-1"
				workspaceCwd="/repo"
				activeTools={undefined}
				toolInputBuffers={undefined}
				activeSubagents={undefined}
				pendingApproval={null}
				isApprovalSubmitting={false}
				onApprovalRespond={async () => {}}
				pendingPlanApproval={null}
				isPlanSubmitting={false}
				onPlanRespond={async () => {}}
				pendingQuestion={null}
				isQuestionSubmitting={false}
				onQuestionRespond={async () => {}}
			/>,
		);

		expect(html).toContain("streaming assistant text");
		expect(html).not.toContain("interrupted snapshot text");
		expect(html).not.toContain("Interrupted");
		expect(html).not.toContain("Response stopped");
	});
});
