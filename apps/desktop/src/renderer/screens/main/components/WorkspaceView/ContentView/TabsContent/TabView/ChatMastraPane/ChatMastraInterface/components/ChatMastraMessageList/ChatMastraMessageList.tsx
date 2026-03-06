import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationLoadingState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { useMemo, useRef } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import { MastraToolCallBlock } from "../../../../ChatPane/ChatInterface/components/MastraToolCallBlock";
import type { ToolPart } from "../../../../ChatPane/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "../../../../ChatPane/ChatInterface/utils/tool-helpers";
import { AssistantMessage } from "./components/AssistantMessage";
import { ChatSearch } from "./components/ChatSearch";
import { MessageScrollbackRail } from "./components/MessageScrollbackRail";
import { PendingApprovalMessage } from "./components/PendingApprovalMessage";
import { PendingPlanApprovalMessage } from "./components/PendingPlanApprovalMessage";
import { PendingQuestionMessage } from "./components/PendingQuestionMessage";
import { SubagentExecutionMessage } from "./components/SubagentExecutionMessage";
import { UserMessage } from "./components/UserMessage";
import { useChatMessageSearch } from "./hooks/useChatMessageSearch";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraActiveTools = NonNullable<UseMastraChatDisplayReturn["activeTools"]>;
type MastraToolInputBuffers = NonNullable<
	UseMastraChatDisplayReturn["toolInputBuffers"]
>;
type MastraActiveSubagents = NonNullable<
	UseMastraChatDisplayReturn["activeSubagents"]
>;
type MastraActiveTool =
	MastraActiveTools extends Map<string, infer ToolState> ? ToolState : never;
type MastraToolInputBuffer =
	MastraToolInputBuffers extends Map<string, infer InputBuffer>
		? InputBuffer
		: never;
type MastraPendingApproval = UseMastraChatDisplayReturn["pendingApproval"];
type MastraPendingPlanApproval =
	UseMastraChatDisplayReturn["pendingPlanApproval"];
type MastraPendingQuestion = UseMastraChatDisplayReturn["pendingQuestion"];

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === "object" && value !== null) {
		return value as Record<string, unknown>;
	}
	return null;
}

interface ChatMastraMessageListProps {
	messages: MastraMessage[];
	isFocused: boolean;
	isRunning: boolean;
	isConversationLoading: boolean;
	isAwaitingAssistant: boolean;
	currentMessage: MastraMessage | null;
	interruptedMessage: {
		id: string;
		sourceMessageId: string;
		content: MastraMessage["content"];
	} | null;
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
}

function toPreviewToolPart({
	toolCallId,
	toolState,
	inputBuffer,
}: {
	toolCallId: string;
	toolState: MastraActiveTool | null;
	inputBuffer: MastraToolInputBuffer | null;
}): ToolPart {
	const toolStateRecord = asRecord(toolState);
	const inputBufferRecord = asRecord(inputBuffer);
	const name =
		(typeof toolStateRecord?.name === "string"
			? toolStateRecord.name
			: undefined) ??
		(typeof inputBufferRecord?.toolName === "string"
			? inputBufferRecord.toolName
			: undefined) ??
		"unknown_tool";
	const status =
		typeof toolStateRecord?.status === "string"
			? toolStateRecord.status
			: "streaming_input";
	const isError =
		typeof toolStateRecord?.isError === "boolean" && toolStateRecord.isError;
	const state: ToolPart["state"] =
		status === "error" || isError
			? "output-error"
			: status === "completed"
				? "output-available"
				: status === "streaming_input"
					? "input-streaming"
					: "input-available";
	const input = toolStateRecord?.args ?? inputBufferRecord?.text ?? {};
	const output = toolStateRecord?.result ?? toolStateRecord?.partialResult;

	return {
		type: `tool-${normalizeToolName(name)}` as ToolPart["type"],
		toolCallId,
		state,
		input,
		...(state === "output-available" || state === "output-error"
			? { output }
			: {}),
	} as ToolPart;
}

function toToolEntries<T>(
	value: Map<string, T> | undefined,
): Array<[string, T]> {
	if (!value) return [];
	return [...value.entries()];
}

function findLastUserMessageIndex(messages: MastraMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") return index;
	}
	return -1;
}

function getStreamingPreviewToolParts({
	activeTools,
	toolInputBuffers,
}: {
	activeTools: MastraActiveTools | undefined;
	toolInputBuffers: MastraToolInputBuffers | undefined;
}): ToolPart[] {
	const activeById = new Map(toToolEntries(activeTools));
	const inputBufferById = new Map(toToolEntries(toolInputBuffers));
	const knownIds = new Set<string>([
		...activeById.keys(),
		...inputBufferById.keys(),
	]);

	return [...knownIds].map((toolCallId) =>
		toPreviewToolPart({
			toolCallId,
			toolState: activeById.get(toolCallId) ?? null,
			inputBuffer: inputBufferById.get(toolCallId) ?? null,
		}),
	);
}

export function ChatMastraMessageList({
	messages,
	isFocused,
	isRunning,
	isConversationLoading,
	isAwaitingAssistant,
	currentMessage,
	interruptedMessage,
	workspaceId,
	sessionId,
	organizationId,
	workspaceCwd,
	activeTools,
	toolInputBuffers,
	activeSubagents,
	pendingApproval,
	isApprovalSubmitting,
	onApprovalRespond,
	pendingPlanApproval,
	isPlanSubmitting,
	onPlanRespond,
	pendingQuestion,
	isQuestionSubmitting,
	onQuestionRespond,
}: ChatMastraMessageListProps) {
	const messageListRef = useRef<HTMLDivElement>(null);
	const chatSearch = useChatMessageSearch({
		containerRef: messageListRef,
		isFocused,
	});
	const visibleMessages = useMemo(() => {
		if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
			return messages;
		}
		const turnStartIndex = findLastUserMessageIndex(messages) + 1;
		const previousTurns = messages.slice(0, turnStartIndex);
		const activeTurnNonAssistant = messages
			.slice(turnStartIndex)
			.filter((message) => message.role !== "assistant");
		return [...previousTurns, ...activeTurnNonAssistant];
	}, [messages, isRunning, currentMessage]);
	const shouldShowInterruptedPreview = Boolean(
		!isRunning && interruptedMessage && interruptedMessage.content.length > 0,
	);
	const interruptedPreview = useMemo(() => {
		if (!shouldShowInterruptedPreview || !interruptedMessage) return null;
		return {
			id: interruptedMessage.id,
			role: "assistant",
			content: interruptedMessage.content,
			createdAt: new Date(),
		} as MastraMessage;
	}, [interruptedMessage, shouldShowInterruptedPreview]);
	const interruptedSourceMessageId =
		shouldShowInterruptedPreview && interruptedMessage
			? interruptedMessage.sourceMessageId
			: null;
	const renderedMessages = useMemo(() => {
		if (!interruptedSourceMessageId) return visibleMessages;
		return visibleMessages.filter(
			(message) => message.id !== interruptedSourceMessageId,
		);
	}, [interruptedSourceMessageId, visibleMessages]);

	const previewToolParts = useMemo(
		() =>
			getStreamingPreviewToolParts({
				activeTools,
				toolInputBuffers,
			}),
		[activeTools, toolInputBuffers],
	);
	const activeSubagentEntries = useMemo(
		() => toToolEntries(activeSubagents),
		[activeSubagents],
	);
	const hasSubagentActivity = activeSubagentEntries.length > 0;
	const canShowPendingAssistantUi =
		isAwaitingAssistant &&
		!currentMessage &&
		!hasSubagentActivity &&
		!pendingApproval &&
		!pendingPlanApproval &&
		!pendingQuestion;
	const shouldShowThinking =
		canShowPendingAssistantUi && previewToolParts.length === 0;
	const shouldShowToolPreview =
		canShowPendingAssistantUi && previewToolParts.length > 0;
	const hasConversationContent =
		renderedMessages.length > 0 || Boolean(interruptedPreview);
	const shouldShowConversationLoading =
		isConversationLoading && !isAwaitingAssistant && !hasConversationContent;
	const shouldShowEmptyState =
		!shouldShowConversationLoading && !hasConversationContent;

	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-3xl py-6 pl-6 pr-16">
				<div ref={messageListRef} className="flex flex-col gap-6">
					{shouldShowConversationLoading ? (
						<ConversationLoadingState />
					) : shouldShowEmptyState ? (
						<ConversationEmptyState
							title="Start a conversation"
							description="Ask anything to get started"
							icon={<HiMiniChatBubbleLeftRight className="size-8" />}
						/>
					) : (
						renderedMessages.map((message) => {
							if (message.role === "user")
								return (
									<UserMessage
										key={message.id}
										message={message}
										workspaceId={workspaceId}
										workspaceCwd={workspaceCwd}
									/>
								);

							return (
								<AssistantMessage
									key={message.id}
									message={message}
									workspaceId={workspaceId}
									sessionId={sessionId}
									organizationId={organizationId}
									workspaceCwd={workspaceCwd}
									isStreaming={false}
									previewToolParts={[]}
								/>
							);
						})
					)}
					{interruptedPreview && (
						<AssistantMessage
							key={interruptedPreview.id}
							message={interruptedPreview}
							workspaceId={workspaceId}
							sessionId={sessionId}
							organizationId={organizationId}
							workspaceCwd={workspaceCwd}
							isStreaming={false}
							previewToolParts={[]}
							footer={
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<span className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
										Interrupted
									</span>
									<span>Response stopped</span>
								</div>
							}
						/>
					)}
					{isRunning && currentMessage && (
						<AssistantMessage
							key={`current-${currentMessage.id}`}
							message={currentMessage}
							workspaceId={workspaceId}
							sessionId={sessionId}
							organizationId={organizationId}
							workspaceCwd={workspaceCwd}
							isStreaming
							previewToolParts={previewToolParts}
						/>
					)}
					{shouldShowThinking && (
						<Message from="assistant">
							<MessageContent>
								<ShimmerLabel className="text-sm text-muted-foreground">
									Thinking...
								</ShimmerLabel>
							</MessageContent>
						</Message>
					)}
					{shouldShowToolPreview && (
						<Message from="assistant">
							<MessageContent>
								{previewToolParts.map((part) => (
									<MastraToolCallBlock
										key={`tool-preview-${part.toolCallId}`}
										part={part}
										workspaceId={workspaceId}
										sessionId={sessionId}
										organizationId={organizationId}
										workspaceCwd={workspaceCwd}
									/>
								))}
							</MessageContent>
						</Message>
					)}
					{hasSubagentActivity && (
						<SubagentExecutionMessage subagents={activeSubagentEntries} />
					)}
					{pendingApproval && (
						<PendingApprovalMessage
							approval={pendingApproval}
							isSubmitting={isApprovalSubmitting}
							onRespond={onApprovalRespond}
						/>
					)}
					{pendingPlanApproval && (
						<PendingPlanApprovalMessage
							planApproval={pendingPlanApproval}
							isSubmitting={isPlanSubmitting}
							onRespond={onPlanRespond}
						/>
					)}
					{pendingQuestion && (
						<PendingQuestionMessage
							question={pendingQuestion}
							isSubmitting={isQuestionSubmitting}
							onRespond={onQuestionRespond}
						/>
					)}
				</div>
			</ConversationContent>
			<ChatSearch
				isOpen={chatSearch.isSearchOpen}
				query={chatSearch.query}
				caseSensitive={chatSearch.caseSensitive}
				matchCount={chatSearch.matchCount}
				activeMatchIndex={chatSearch.activeMatchIndex}
				onQueryChange={chatSearch.setQuery}
				onCaseSensitiveChange={chatSearch.setCaseSensitive}
				onFindNext={chatSearch.findNext}
				onFindPrevious={chatSearch.findPrevious}
				onClose={chatSearch.closeSearch}
			/>
			<MessageScrollbackRail messages={renderedMessages} />
			<ConversationScrollButton />
		</Conversation>
	);
}
