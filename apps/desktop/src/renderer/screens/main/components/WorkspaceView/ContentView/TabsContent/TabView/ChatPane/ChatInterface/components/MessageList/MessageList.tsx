import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import type { ChatMessage } from "../../types";
import { MessagePartsRenderer } from "../MessagePartsRenderer";

interface MessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
	onAnswer: (toolCallId: string, answers: Record<string, string>) => void;
}

export function MessageList({
	messages,
	isStreaming,
	onAnswer,
}: MessageListProps) {
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
							return (
								<div key={msg.id} className="flex justify-end">
									<div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
										{msg.parts.map((part) =>
											part.type === "text" ? part.text : null,
										)}
									</div>
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
