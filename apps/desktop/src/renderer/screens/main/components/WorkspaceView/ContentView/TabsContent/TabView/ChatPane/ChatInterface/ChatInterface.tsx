import { useDurableChat } from "@superset/durable-session/react";
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
import { useCallback, useEffect, useRef, useState } from "react";
import {
	HiMiniAtSymbol,
	HiMiniChatBubbleLeftRight,
	HiMiniPaperClip,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { ContextIndicator } from "./components/ContextIndicator";
import { ModelPicker } from "./components/ModelPicker";
import { MODELS, SUGGESTIONS } from "./constants";
import type { ModelOption } from "./types";

interface ChatInterfaceProps {
	sessionId: string;
	cwd: string;
}

export function ChatInterface({ sessionId, cwd }: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[1]);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

	// Get proxy config from main process
	const { data: config } = electronTrpc.aiChat.getConfig.useQuery();

	// Real-time data via useDurableChat → SSE from proxy
	const {
		messages,
		sendMessage,
		isLoading,
		stop,
		addToolApprovalResponse,
		connect,
	} = useDurableChat({
		sessionId,
		proxyUrl: config?.proxyUrl ?? "http://localhost:8080",
		autoConnect: false,
		stream: config?.authToken
			? { headers: { Authorization: `Bearer ${config.authToken}` } }
			: undefined,
	});

	// Stable ref for connect — avoids stale closures in tRPC callbacks
	const connectRef = useRef(connect);
	connectRef.current = connect;
	const hasConnected = useRef(false);

	// Session lifecycle via tRPC callbacks (not useEffect state tracking)
	const startSession = electronTrpc.aiChat.startSession.useMutation({
		onSuccess: () => {
			if (!hasConnected.current && config?.proxyUrl) {
				hasConnected.current = true;
				connectRef.current();
			}
		},
	});
	const stopSession = electronTrpc.aiChat.stopSession.useMutation();

	// Start session on mount, stop on unmount
	useEffect(() => {
		if (!sessionId || !cwd) return;
		hasConnected.current = false;
		startSession.mutate({ sessionId, cwd });
		return () => {
			stopSession.mutate({ sessionId });
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount/unmount; mutations are stable transports
	}, [sessionId, cwd]);

	// Handle case where config query resolves after session already started
	useEffect(() => {
		if (!hasConnected.current && startSession.isSuccess && config?.proxyUrl) {
			hasConnected.current = true;
			connectRef.current();
		}
	}, [startSession.isSuccess, config?.proxyUrl]);

	const handleSend = useCallback(
		(message: { text: string }) => {
			if (!message.text.trim()) return;
			sendMessage(message.text);
		},
		[sendMessage],
	);

	const handleSuggestion = useCallback(
		(suggestion: string) => {
			handleSend({ text: suggestion });
		},
		[handleSend],
	);

	const handleApprove = useCallback(
		(approvalId: string) => {
			addToolApprovalResponse({ id: approvalId, approved: true });
		},
		[addToolApprovalResponse],
	);

	const handleDeny = useCallback(
		(approvalId: string) => {
			addToolApprovalResponse({ id: approvalId, approved: false });
		},
		[addToolApprovalResponse],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			stop();
		},
		[stop],
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
							<ChatMessageItem
								key={msg.id}
								message={msg}
								onApprove={handleApprove}
								onDeny={handleDeny}
							/>
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
									onClick={isLoading ? handleStop : undefined}
								/>
							</div>
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		</div>
	);
}
