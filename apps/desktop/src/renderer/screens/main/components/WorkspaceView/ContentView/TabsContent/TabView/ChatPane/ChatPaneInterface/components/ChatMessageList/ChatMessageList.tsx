import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationLoadingState,
	ConversationScrollButton,
	useConversationContext,
} from "@superset/ui/ai-elements/conversation";
import { useEffect, useMemo, useRef } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import type {
	ChatMessage,
	ChatMessageListProps,
} from "./ChatMessageList.types";
import { AssistantMessage } from "./components/AssistantMessage";
import { ChatSearch } from "./components/ChatSearch";
import { InterruptedFooter } from "./components/InterruptedFooter";
import { MessageScrollbackRail } from "./components/MessageScrollbackRail";
import { PendingApprovalMessage } from "./components/PendingApprovalMessage";
import { PendingPlanApprovalMessage } from "./components/PendingPlanApprovalMessage";
import { ThinkingMessage } from "./components/ThinkingMessage";
import { ToolPreviewMessage } from "./components/ToolPreviewMessage";
import { UserMessage } from "./components/UserMessage";
import { useChatMessageSearch } from "./hooks/useChatMessageSearch";
import {
	findLatestSubmitPlanToolCallId,
	getInterruptedPreview,
	getStreamingPreviewToolParts,
	getVisibleMessages,
	removeInterruptedSourceMessage,
	resolvePendingPlanToolCallId,
} from "./utils/messageListHelpers";

function ScrollAnchor({
	questionId,
	answeredQuestionId,
	isAwaitingAssistant,
}: {
	questionId: string | null | undefined;
	answeredQuestionId: string | null;
	isAwaitingAssistant: boolean;
}) {
	const { scrollToBottom } = useConversationContext();

	// Scroll to bottom whenever the assistant starts responding (new message
	// sent or question answered), so "Thinking…" and the response are visible.
	useEffect(() => {
		if (!isAwaitingAssistant) return;
		void scrollToBottom("instant");
	}, [isAwaitingAssistant, scrollToBottom]);

	// Scroll to bottom when a new question arrives.
	useEffect(() => {
		if (!questionId) return;
		void scrollToBottom("instant");
	}, [questionId, scrollToBottom]);

	// When an answer is submitted the overlay hides, shrinking the footer and
	// growing the Conversation container. The browser clamps scrollTop, which
	// the library interprets as "user scrolled up" (setIsAtBottom(false)) via
	// its 1ms setTimeout. We run after that timer with a 10ms delay so our
	// scrollToBottom fires AFTER the library has reset the pin, restoring it.
	useEffect(() => {
		if (!answeredQuestionId) return;
		const id = setTimeout(() => void scrollToBottom("instant"), 10);
		return () => clearTimeout(id);
	}, [answeredQuestionId, scrollToBottom]);

	return null;
}

export function ChatMessageList({
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
	pendingApproval,
	isApprovalSubmitting,
	onApprovalRespond,
	pendingPlanApproval,
	isPlanSubmitting,
	onPlanRespond,
	pendingQuestion,
	answeredQuestionId,
	editingUserMessageId,
	isEditSubmitting,
	onStartEditUserMessage,
	onCancelEditUserMessage,
	onSubmitEditedUserMessage,
	onRestartUserMessage,
}: ChatMessageListProps) {
	const messageListRef = useRef<HTMLDivElement>(null);
	const chatSearch = useChatMessageSearch({
		containerRef: messageListRef,
		isFocused,
	});

	const visibleMessages = useMemo(
		() =>
			getVisibleMessages({
				messages,
				isRunning,
				currentMessage,
			}),
		[currentMessage, isRunning, messages],
	);

	const interruptedPreview = useMemo(
		() =>
			getInterruptedPreview({
				isRunning,
				interruptedMessage,
			}),
		[interruptedMessage, isRunning],
	);

	const renderedMessages = useMemo(
		() =>
			removeInterruptedSourceMessage({
				messages: visibleMessages,
				interruptedMessage: interruptedPreview ? interruptedMessage : null,
			}),
		[interruptedMessage, interruptedPreview, visibleMessages],
	);

	const previewToolParts = useMemo(
		() =>
			getStreamingPreviewToolParts({
				activeTools,
				toolInputBuffers,
			}),
		[activeTools, toolInputBuffers],
	);
	const pendingPlanToolCallId = useMemo(() => {
		const anchorMessages: ChatMessage[] = [...renderedMessages];
		if (interruptedPreview) {
			anchorMessages.push(interruptedPreview);
		}
		if (currentMessage?.role === "assistant") {
			anchorMessages.push(currentMessage);
		}

		const latestSubmitPlanToolCallId = findLatestSubmitPlanToolCallId({
			messages: anchorMessages,
			previewToolParts,
		});

		return resolvePendingPlanToolCallId({
			pendingPlanApproval,
			fallbackToolCallId: latestSubmitPlanToolCallId,
		});
	}, [
		currentMessage,
		interruptedPreview,
		pendingPlanApproval,
		previewToolParts,
		renderedMessages,
	]);

	const shouldShowStandalonePendingPlan = Boolean(
		pendingPlanApproval && !pendingPlanToolCallId,
	);

	const canShowPendingAssistantUi =
		isAwaitingAssistant && !currentMessage && !pendingApproval;
	const shouldShowThinking =
		canShowPendingAssistantUi &&
		!pendingPlanApproval &&
		!pendingQuestion &&
		previewToolParts.length === 0;
	const shouldShowToolPreview =
		canShowPendingAssistantUi &&
		previewToolParts.length > 0 &&
		(!pendingPlanApproval || Boolean(pendingPlanToolCallId));

	const hasConversationContent =
		renderedMessages.length > 0 || Boolean(interruptedPreview);
	const shouldShowConversationLoading =
		isConversationLoading && !isAwaitingAssistant && !hasConversationContent;
	const shouldShowEmptyState =
		!shouldShowConversationLoading && !hasConversationContent;

	const inlineToolStateProps = {
		pendingPlanApproval,
		pendingPlanToolCallId,
		isPlanSubmitting,
		onPlanRespond,
	} as const;

	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-[680px] py-6">
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
						renderedMessages.map((message, messageIndex) => {
							if (message.role === "user") {
								return (
									<UserMessage
										key={message.id}
										message={message}
										prefixMessages={renderedMessages.slice(0, messageIndex)}
										workspaceId={workspaceId}
										workspaceCwd={workspaceCwd}
										isEditing={editingUserMessageId === message.id}
										isSubmitting={isEditSubmitting}
										onStartEdit={onStartEditUserMessage}
										onCancelEdit={onCancelEditUserMessage}
										onSubmitEdit={onSubmitEditedUserMessage}
										onRestart={onRestartUserMessage}
										actionDisabled={isAwaitingAssistant}
									/>
								);
							}

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
									{...inlineToolStateProps}
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
							isInterrupted
							previewToolParts={[]}
							{...inlineToolStateProps}
							footer={<InterruptedFooter />}
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
							{...inlineToolStateProps}
						/>
					)}
					{shouldShowThinking ? <ThinkingMessage /> : null}
					{shouldShowToolPreview ? (
						<ToolPreviewMessage
							previewToolParts={previewToolParts}
							workspaceId={workspaceId}
							sessionId={sessionId}
							organizationId={organizationId}
							workspaceCwd={workspaceCwd}
							pendingPlanApproval={pendingPlanApproval}
							pendingPlanToolCallId={pendingPlanToolCallId}
							isPlanSubmitting={isPlanSubmitting}
							onPlanRespond={onPlanRespond}
						/>
					) : null}
					{pendingApproval && (
						<PendingApprovalMessage
							approval={pendingApproval}
							isSubmitting={isApprovalSubmitting}
							onRespond={onApprovalRespond}
						/>
					)}
					{shouldShowStandalonePendingPlan && pendingPlanApproval && (
						<PendingPlanApprovalMessage
							planApproval={pendingPlanApproval}
							isSubmitting={isPlanSubmitting}
							onRespond={onPlanRespond}
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
			<ScrollAnchor
				questionId={pendingQuestion?.questionId}
				answeredQuestionId={answeredQuestionId}
				isAwaitingAssistant={isAwaitingAssistant}
			/>
		</Conversation>
	);
}
