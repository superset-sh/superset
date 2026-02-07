import {
	Checkpoint,
	CheckpointIcon,
	CheckpointTrigger,
} from "@superset/ui/ai-elements/checkpoint";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@superset/ui/ai-elements/suggestion";
import { Fragment, useCallback, useState } from "react";
import {
	HiMiniAtSymbol,
	HiMiniChatBubbleLeftRight,
	HiMiniPaperClip,
} from "react-icons/hi2";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { ContextIndicator } from "./components/ContextIndicator";
import { ModelPicker } from "./components/ModelPicker";
import { MOCK_MESSAGES, MODELS, SUGGESTIONS } from "./constants";
import type { ChatMessage, ModelOption } from "./types";

export function ChatInterface() {
	const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[1]);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

	const handleSend = useCallback((message: { text: string }) => {
		if (!message.text.trim()) return;

		const userMessage: ChatMessage = {
			id: `msg-${Date.now()}`,
			role: "user",
			content: message.text,
		};

		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);

		setTimeout(() => {
			const assistantMessage: ChatMessage = {
				id: `msg-${Date.now()}-reply`,
				role: "assistant",
				content:
					"This is a mock response. The chat backend is not connected yet.",
			};
			setMessages((prev) => [...prev, assistantMessage]);
			setIsLoading(false);
		}, 1000);
	}, []);

	const handleSuggestion = useCallback(
		(suggestion: string) => {
			handleSend({ text: suggestion });
		},
		[handleSend],
	);

	return (
		<div className="flex h-full flex-col bg-background">
			<Conversation className="flex-1">
				<ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
					{messages.length === 0 ? (
						<>
							<ConversationEmptyState
								title="Start a conversation"
								description="Ask anything to get started"
								icon={<HiMiniChatBubbleLeftRight className="size-8" />}
							/>
							<Suggestions className="justify-center">
								{SUGGESTIONS.map((s) => (
									<Suggestion
										key={s}
										suggestion={s}
										onClick={handleSuggestion}
									/>
								))}
							</Suggestions>
						</>
					) : (
						messages.map((msg) => (
							<Fragment key={msg.id}>
								{msg.checkpoint && (
									<Checkpoint>
										<CheckpointIcon />
										<CheckpointTrigger tooltip="Restore to this point">
											{msg.checkpoint}
										</CheckpointTrigger>
									</Checkpoint>
								)}
								<ChatMessageItem message={msg} />
							</Fragment>
						))
					)}
					{isLoading && (
						<Message from="assistant">
							<MessageContent>
								<Shimmer className="text-sm" duration={1.5}>
									Thinking...
								</Shimmer>
							</MessageContent>
						</Message>
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="border-t bg-background px-4 py-3">
				<div className="mx-auto w-full max-w-3xl">
					{messages.length > 0 && (
						<Suggestions className="mb-3">
							{SUGGESTIONS.map((s) => (
								<Suggestion key={s} suggestion={s} onClick={handleSuggestion} />
							))}
						</Suggestions>
					)}
					<PromptInput onSubmit={handleSend}>
						<PromptInputTextarea placeholder="Ask anything..." />
						<PromptInputFooter>
							<PromptInputTools>
								<PromptInputButton>
									<HiMiniPaperClip className="size-4" />
								</PromptInputButton>
								<PromptInputButton>
									<HiMiniAtSymbol className="size-4" />
								</PromptInputButton>
								<ModelPicker
									selectedModel={selectedModel}
									onSelectModel={setSelectedModel}
									open={modelSelectorOpen}
									onOpenChange={setModelSelectorOpen}
								/>
							</PromptInputTools>
							<div className="flex items-center gap-1">
								<ContextIndicator />
								<PromptInputSubmit
									status={isLoading ? "streaming" : undefined}
								/>
							</div>
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		</div>
	);
}
