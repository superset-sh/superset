import type { DurableChatCollections } from "@superset/durable-session/react";
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
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@superset/ui/ai-elements/suggestion";
import { ThinkingToggle } from "@superset/ui/ai-elements/thinking-toggle";
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
import { SlashCommandMenu } from "./components/SlashCommandMenu";
import { MODELS, SUGGESTIONS } from "./constants";
import { useClaudeCodeHistory } from "./hooks/useClaudeCodeHistory";
import { useSlashCommands } from "./hooks/useSlashCommands";
import type { ModelOption } from "./types";
import { extractTitleFromMessages } from "./utils/extract-title";

interface ChatInterfaceProps {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	paneId: string;
	tabId: string;
}

export function ChatInterface({
	sessionId,
	workspaceId,
	cwd,
	paneId,
	tabId,
}: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[1]);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);

	const updateConfig = electronTrpc.aiChat.updateSessionConfig.useMutation();

	const { data: config } = electronTrpc.aiChat.getConfig.useQuery();

	const {
		messages,
		sendMessage,
		isLoading,
		error,
		connectionStatus,
		stop,
		addToolApprovalResponse,
		connect,
		collections,
	} = useDurableChat({
		sessionId,
		proxyUrl: config?.proxyUrl ?? "http://localhost:8080",
		autoConnect: false,
		stream: config?.authToken
			? { headers: { Authorization: `Bearer ${config.authToken}` } }
			: undefined,
	});

	const connectRef = useRef(connect);
	connectRef.current = connect;
	const hasConnected = useRef(false);

	const doConnect = useCallback(() => {
		if (hasConnected.current) return;
		hasConnected.current = true;
		console.log("[chat] Connecting to proxy...");
		connectRef.current().catch((err) => {
			console.error("[chat] Connect failed:", err);
			hasConnected.current = false;
		});
	}, []);

	const [sessionReady, setSessionReady] = useState(false);

	const startSession = electronTrpc.aiChat.startSession.useMutation({
		onSuccess: () => {
			console.log("[chat] Session started");
			setSessionReady(true);
		},
		onError: (err) => {
			console.error("[chat] Start session failed:", err);
		},
	});
	const restoreSession = electronTrpc.aiChat.restoreSession.useMutation({
		onSuccess: () => {
			console.log("[chat] Session restored");
			setSessionReady(true);
		},
		onError: (err) => {
			console.error("[chat] Restore session failed:", err);
		},
	});
	const stopSession = electronTrpc.aiChat.stopSession.useMutation();
	const renameSession = electronTrpc.aiChat.renameSession.useMutation();

	const startSessionRef = useRef(startSession);
	startSessionRef.current = startSession;
	const restoreSessionRef = useRef(restoreSession);
	restoreSessionRef.current = restoreSession;
	const stopSessionRef = useRef(stopSession);
	stopSessionRef.current = stopSession;
	const renameSessionRef = useRef(renameSession);
	renameSessionRef.current = renameSession;

	const { data: existingSession } = electronTrpc.aiChat.getSession.useQuery(
		{ sessionId },
		{ enabled: !!sessionId },
	);

	useEffect(() => {
		if (!sessionId || !cwd) return;
		if (existingSession === undefined) return;

		hasConnected.current = false;
		setSessionReady(false);

		if (existingSession) {
			restoreSessionRef.current.mutate({ sessionId, cwd, paneId, tabId });
		} else {
			startSessionRef.current.mutate({
				sessionId,
				workspaceId,
				cwd,
				paneId,
				tabId,
			});
		}

		return () => {
			stopSessionRef.current.mutate({ sessionId });
		};
	}, [sessionId, cwd, workspaceId, existingSession, paneId, tabId]);

	useEffect(() => {
		if (sessionReady && config?.proxyUrl) {
			doConnect();
		}
	}, [sessionReady, config?.proxyUrl, doConnect]);

	const hasAutoTitled = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: must reset when session changes
	useEffect(() => {
		hasAutoTitled.current = false;
	}, [sessionId]);

	useEffect(() => {
		if (hasAutoTitled.current || !sessionId) return;

		const userMsg = messages.find((m) => m.role === "user");
		const assistantMsg = messages.find((m) => m.role === "assistant");
		if (!userMsg || !assistantMsg) return;

		hasAutoTitled.current = true;
		const title = extractTitleFromMessages(messages) ?? "Chat";
		renameSessionRef.current.mutate({ sessionId, title });
	}, [messages, sessionId]);

	const handleRename = useCallback(
		(title: string) => {
			renameSessionRef.current.mutate({ sessionId, title });
		},
		[sessionId],
	);

	const { allMessages } = useClaudeCodeHistory({
		sessionId,
		liveMessages: messages,
		hasAutoTitled,
		onRename: handleRename,
	});

	const handleSend = useCallback(
		(message: { text: string }) => {
			if (!message.text.trim()) return;
			sendMessage(message.text).catch((err) => {
				console.error("[chat] Send failed:", err);
			});
		},
		[sendMessage],
	);

	const handleSendText = useCallback(
		(text: string) => {
			handleSend({ text });
		},
		[handleSend],
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

	const handleThinkingToggle = useCallback(
		(enabled: boolean) => {
			setThinkingEnabled(enabled);
			updateConfig.mutate({
				sessionId,
				maxThinkingTokens: enabled ? 10000 : null,
			});
		},
		[sessionId, updateConfig],
	);

	const handleModelSelect = useCallback(
		(model: ModelOption) => {
			setSelectedModel(model);
			updateConfig.mutate({
				sessionId,
				model: model.id,
			});
		},
		[sessionId, updateConfig],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			stop();
		},
		[stop],
	);

	// TODO: Implement proper /clear handler that resets the conversation
	const handleClear = useCallback(() => {
		console.log("[chat] /clear requested");
	}, []);

	return (
		<div className="flex h-full flex-col bg-background">
			{error && (
				<div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error.message}
				</div>
			)}
			{connectionStatus !== "connected" &&
				connectionStatus !== "disconnected" && (
					<div className="border-b px-4 py-1 text-xs text-muted-foreground">
						Connection: {connectionStatus}
					</div>
				)}
			<Conversation className="flex-1">
				<ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
					{allMessages.length === 0 ? (
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
						allMessages.map((msg) => (
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
					{allMessages.length > 0 && (
						<Suggestions className="mb-3">
							{SUGGESTIONS.map((s) => (
								<Suggestion key={s} suggestion={s} onClick={handleSuggestion} />
							))}
						</Suggestions>
					)}
					<PromptInputProvider>
						<ChatInputArea
							handleSend={handleSend}
							handleSendText={handleSendText}
							handleClear={handleClear}
							isLoading={isLoading}
							handleStop={handleStop}
							thinkingEnabled={thinkingEnabled}
							handleThinkingToggle={handleThinkingToggle}
							selectedModel={selectedModel}
							handleModelSelect={handleModelSelect}
							modelSelectorOpen={modelSelectorOpen}
							setModelSelectorOpen={setModelSelectorOpen}
							collections={collections}
						/>
					</PromptInputProvider>
				</div>
			</div>
		</div>
	);
}

interface ChatInputAreaProps {
	handleSend: (message: { text: string }) => void;
	handleSendText: (text: string) => void;
	handleClear: () => void;
	isLoading: boolean;
	handleStop: (e: React.MouseEvent) => void;
	thinkingEnabled: boolean;
	handleThinkingToggle: (enabled: boolean) => void;
	selectedModel: ModelOption;
	handleModelSelect: (model: ModelOption) => void;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: (open: boolean) => void;
	collections: DurableChatCollections;
}

function ChatInputArea({
	handleSend,
	handleSendText,
	handleClear,
	isLoading,
	handleStop,
	thinkingEnabled,
	handleThinkingToggle,
	selectedModel,
	handleModelSelect,
	modelSelectorOpen,
	setModelSelectorOpen,
	collections,
}: ChatInputAreaProps) {
	const { textInput } = usePromptInputController();

	const slashCommands = useSlashCommands({
		inputValue: textInput.value,
		onClear: handleClear,
		onSendMessage: handleSendText,
	});

	const handleKeyDownCapture = useCallback(
		(e: React.KeyboardEvent) => {
			if (slashCommands.isOpen) {
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					textInput.setInput("");
					return;
				}
				if (e.key === "Enter" || e.key === "Tab") {
					e.preventDefault();
					e.stopPropagation();
					const cmd =
						slashCommands.filteredCommands[slashCommands.selectedIndex];
					if (cmd) {
						const result = slashCommands.handleSelectCommand(cmd);
						textInput.setInput(result.text);
					}
					return;
				}
				// ArrowUp/ArrowDown for navigation
				slashCommands.handleKeyDown(e);
			}
		},
		[slashCommands, textInput],
	);

	const handleMenuSelect = useCallback(
		(command: Parameters<typeof slashCommands.handleSelectCommand>[0]) => {
			const result = slashCommands.handleSelectCommand(command);
			textInput.setInput(result.text);
		},
		[slashCommands, textInput],
	);

	return (
		<div className="relative">
			{slashCommands.isOpen && (
				<SlashCommandMenu
					commands={slashCommands.filteredCommands}
					selectedIndex={slashCommands.selectedIndex}
					onSelect={handleMenuSelect}
					onHover={slashCommands.setSelectedIndex}
				/>
			)}
			{/* onKeyDownCapture intercepts keys before textarea handles them */}
			<div onKeyDownCapture={handleKeyDownCapture}>
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
							<ThinkingToggle
								enabled={thinkingEnabled}
								onToggle={handleThinkingToggle}
							/>
							<ModelPicker
								selectedModel={selectedModel}
								onSelectModel={handleModelSelect}
								open={modelSelectorOpen}
								onOpenChange={setModelSelectorOpen}
							/>
						</PromptInputTools>
						<div className="flex items-center gap-1">
							<ContextIndicator
								collections={collections}
								modelId={selectedModel.id}
							/>
							<PromptInputSubmit
								status={isLoading ? "streaming" : undefined}
								onClick={isLoading ? handleStop : undefined}
							/>
						</div>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}
