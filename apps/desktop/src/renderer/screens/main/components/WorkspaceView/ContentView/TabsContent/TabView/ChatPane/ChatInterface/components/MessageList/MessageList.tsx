import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import type { ChatStatus, UIMessage } from "ai";
import { FileIcon, FileTextIcon, ImageIcon } from "lucide-react";
import { useCallback } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { InterruptedMessagePreview } from "../../types";
import { MessagePartsRenderer } from "../MessagePartsRenderer";
import { MessageScrollbackRail } from "./components/MessageScrollbackRail";

interface MessageListProps {
	messages: UIMessage[];
	interruptedMessage?: InterruptedMessagePreview | null;
	isStreaming: boolean;
	submitStatus?: ChatStatus;
	workspaceId?: string;
	onAnswer: (
		toolCallId: string,
		answers: Record<string, string>,
	) => Promise<void>;
}

function FileChip({
	filename,
	mediaType,
}: {
	filename: string;
	mediaType: string;
}) {
	const icon = mediaType.startsWith("image/") ? (
		<ImageIcon className="size-3.5" />
	) : mediaType === "application/pdf" ? (
		<FileIcon className="size-3.5" />
	) : (
		<FileTextIcon className="size-3.5" />
	);

	return (
		<div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
			{icon}
			<span className="max-w-[150px] truncate">{filename || "Attachment"}</span>
		</div>
	);
}

export function MessageList({
	messages,
	interruptedMessage,
	isStreaming,
	submitStatus,
	workspaceId,
	onAnswer,
}: MessageListProps) {
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const isThinking =
		submitStatus === "submitted" || submitStatus === "streaming";

	const handleImageClick = useCallback(
		(url: string) => {
			if (!workspaceId) return;
			addFileViewerPane(workspaceId, { filePath: url, isPinned: true });
		},
		[workspaceId, addFileViewerPane],
	);

	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-3xl gap-6 py-6 pl-4 pr-16">
				{messages.length === 0 && !interruptedMessage ? (
					<ConversationEmptyState
						title="Start a conversation"
						description="Ask anything to get started"
						icon={<HiMiniChatBubbleLeftRight className="size-8" />}
					/>
				) : (
					messages.map((msg, index) => {
						const isLastAssistant =
							msg.role === "assistant" && index === messages.length - 1;
						const shouldAnimateStreaming =
							isLastAssistant && (isStreaming || submitStatus === "submitted");

						if (msg.role === "user") {
							const textContent = msg.parts
								.filter((p) => p.type === "text")
								.map((p) => p.text)
								.join("");
							const fileParts = msg.parts.filter((p) => p.type === "file");
							const imageParts = fileParts.filter(
								(p) => p.type === "file" && p.mediaType.startsWith("image/"),
							);
							const nonImageParts = fileParts.filter(
								(p) => p.type === "file" && !p.mediaType.startsWith("image/"),
							);

							return (
								<div
									key={msg.id}
									className="flex flex-col items-end gap-2"
									data-chat-user-message="true"
									data-message-id={msg.id}
								>
									{imageParts.length > 0 && (
										<div className="flex max-w-[85%] flex-wrap gap-2">
											{imageParts.map((p) =>
												p.type === "file" ? (
													<button
														key={`${msg.id}-img-${p.url}`}
														type="button"
														className="cursor-zoom-in"
														onClick={() => handleImageClick(p.url)}
													>
														<img
															src={p.url}
															alt={p.filename || "Attached image"}
															className="max-h-48 rounded-lg object-contain"
														/>
													</button>
												) : null,
											)}
										</div>
									)}
									{nonImageParts.length > 0 && (
										<div className="flex max-w-[85%] flex-wrap gap-1.5">
											{nonImageParts.map((p) =>
												p.type === "file" ? (
													<FileChip
														key={`${msg.id}-file-${p.url}`}
														filename={p.filename || ""}
														mediaType={p.mediaType}
													/>
												) : null,
											)}
										</div>
									)}
									{textContent && (
										<div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
											{textContent}
										</div>
									)}
								</div>
							);
						}

						return (
							<Message key={msg.id} from={msg.role}>
								<MessageContent>
									{isLastAssistant && isThinking && msg.parts.length === 0 ? (
										<ShimmerLabel className="text-sm text-muted-foreground">
											Thinking...
										</ShimmerLabel>
									) : (
										<MessagePartsRenderer
											parts={msg.parts}
											isLastAssistant={isLastAssistant}
											isStreaming={shouldAnimateStreaming}
											workspaceId={workspaceId}
											onAnswer={onAnswer}
										/>
									)}
								</MessageContent>
							</Message>
						);
					})
				)}
				{interruptedMessage && interruptedMessage.parts.length > 0 && (
					<Message key={interruptedMessage.id} from="assistant">
						<MessageContent>
							<MessagePartsRenderer
								parts={interruptedMessage.parts}
								isLastAssistant={false}
								isStreaming={false}
								workspaceId={workspaceId}
								onAnswer={onAnswer}
							/>
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<span className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
									Interrupted
								</span>
								<span>Response stopped</span>
							</div>
						</MessageContent>
					</Message>
				)}
				{isThinking && messages[messages.length - 1]?.role === "user" && (
					<Message from="assistant">
						<MessageContent>
							<ShimmerLabel className="text-sm text-muted-foreground">
								Thinking...
							</ShimmerLabel>
						</MessageContent>
					</Message>
				)}
			</ConversationContent>
			<MessageScrollbackRail messages={messages} />
			<ConversationScrollButton />
		</Conversation>
	);
}
