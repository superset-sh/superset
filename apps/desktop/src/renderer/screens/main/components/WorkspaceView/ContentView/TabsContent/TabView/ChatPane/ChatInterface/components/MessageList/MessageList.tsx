import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import type { UIMessage } from "ai";
import { FileIcon, FileTextIcon, ImageIcon } from "lucide-react";
import { useCallback } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import { useTabsStore } from "renderer/stores/tabs/store";
import { MessagePartsRenderer } from "../MessagePartsRenderer";

interface MessageListProps {
	messages: UIMessage[];
	isStreaming: boolean;
	workspaceId?: string;
	onAnswer?: (toolCallId: string, answers: Record<string, string>) => void;
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
	isStreaming,
	workspaceId,
	onAnswer,
}: MessageListProps) {
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	const handleImageClick = useCallback(
		(url: string) => {
			if (!workspaceId) return;
			addFileViewerPane(workspaceId, { filePath: url, isPinned: true });
		},
		[workspaceId, addFileViewerPane],
	);

	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
				{messages.length === 0 ? (
					<ConversationEmptyState
						title="Start a conversation"
						description="Ask anything to get started"
						icon={<HiMiniChatBubbleLeftRight className="size-8" />}
					/>
				) : (
					messages.map((msg, index) => {
						const isLastAssistant =
							msg.role === "assistant" && index === messages.length - 1;

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
								<div key={msg.id} className="flex flex-col items-end gap-2">
									{imageParts.length > 0 && (
										<div className="flex max-w-[85%] flex-wrap gap-2">
											{imageParts.map((p, i) =>
												p.type === "file" ? (
													<button
														key={`${msg.id}-img-${i}`}
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
											{nonImageParts.map((p, i) =>
												p.type === "file" ? (
													<FileChip
														key={`${msg.id}-file-${i}`}
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
									{isLastAssistant && isStreaming && msg.parts.length === 0 ? (
										<Shimmer
											className="text-sm text-muted-foreground"
											duration={1}
										>
											Thinking...
										</Shimmer>
									) : (
										<MessagePartsRenderer
											parts={msg.parts}
											isLastAssistant={isLastAssistant}
											isStreaming={isStreaming}
											onAnswer={onAnswer}
										/>
									)}
								</MessageContent>
							</Message>
						);
					})
				)}
			</ConversationContent>
			<ConversationScrollButton />
		</Conversation>
	);
}
