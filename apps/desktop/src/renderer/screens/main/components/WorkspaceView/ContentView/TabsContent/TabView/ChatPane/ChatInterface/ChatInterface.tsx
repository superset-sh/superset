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
} from "@superset/ui/ai-elements/prompt-input";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { ThinkingToggle } from "@superset/ui/ai-elements/thinking-toggle";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiMiniChatBubbleLeftRight, HiMiniPaperClip } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { ContextIndicator } from "./components/ContextIndicator";
import {
	FileMentionAnchor,
	FileMentionProvider,
	FileMentionTrigger,
} from "./components/FileMentionPopover";
import { ModelPicker } from "./components/ModelPicker";
import { MODELS } from "./constants";
import { useClaudeCodeHistory } from "./hooks/useClaudeCodeHistory";
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

	return (
		<div className="flex h-full flex-col bg-background">
			{connectionStatus !== "connected" &&
				connectionStatus !== "disconnected" && (
					<div className="border-b px-4 py-1 text-xs text-muted-foreground">
						Connection: {connectionStatus}
					</div>
				)}
			<Conversation className="flex-1">
				<ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
					{allMessages.length === 0 ? (
						<ConversationEmptyState
							title="Start a conversation"
							description="Ask anything to get started"
							icon={<HiMiniChatBubbleLeftRight className="size-8" />}
						/>
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
					{error && (
						<div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive mb-3">
							{error.message}
						</div>
					)}
					<PromptInputProvider>
						<FileMentionProvider cwd={cwd}>
							<FileMentionAnchor>
								<PromptInput onSubmit={handleSend}>
									<PromptInputTextarea placeholder="Ask anything..." />
									<PromptInputFooter>
										<PromptInputTools>
											<PromptInputButton>
												<HiMiniPaperClip className="size-4" />
											</PromptInputButton>
											<FileMentionTrigger />
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
							</FileMentionAnchor>
						</FileMentionProvider>
					</PromptInputProvider>
				</div>
			</div>
		</div>
	);
}
