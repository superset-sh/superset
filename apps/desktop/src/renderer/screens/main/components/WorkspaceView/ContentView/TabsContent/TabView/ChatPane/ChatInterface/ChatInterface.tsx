import { StreamError } from "@superset/durable-session";
import { useDurableChat } from "@superset/durable-session/react";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message } from "@superset/ui/ai-elements/message";
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
import { PermissionModePicker } from "./components/PermissionModePicker";
import { SlashCommandInput } from "./components/SlashCommandInput";
import { MODELS } from "./constants";
import { useClaudeCodeHistory } from "./hooks/useClaudeCodeHistory";
import type { SlashCommand } from "./hooks/useSlashCommands";
import type { ModelOption, PermissionMode } from "./types";

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
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [isSending, setIsSending] = useState(false);

	const updateConfig = electronTrpc.aiChat.updateSessionConfig.useMutation();
	const triggerAgent = electronTrpc.aiChat.sendMessage.useMutation({
		onError: (err) => {
			console.error("[chat] Agent trigger failed:", err);
			setIsSending(false);
		},
	});
	const interruptAgent = electronTrpc.aiChat.interrupt.useMutation();
	const approveToolUse = electronTrpc.aiChat.approveToolUse.useMutation();

	const { data: config } = electronTrpc.aiChat.getConfig.useQuery();

	const {
		messages,
		sendMessage,
		isLoading,
		error,
		connectionStatus,
		stop,
		addToolApprovalResponse,
		addToolAnswerResponse,
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
	const selectedModelRef = useRef(selectedModel);
	selectedModelRef.current = selectedModel;
	const permissionModeRef = useRef(permissionMode);
	permissionModeRef.current = permissionMode;

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
			restoreSessionRef.current.mutate({
				sessionId,
				cwd,
				paneId,
				tabId,
				model: selectedModelRef.current.id,
				permissionMode: permissionModeRef.current,
			});
		} else {
			startSessionRef.current.mutate({
				sessionId,
				workspaceId,
				cwd,
				paneId,
				tabId,
				model: selectedModelRef.current.id,
				permissionMode: permissionModeRef.current,
			});
		}

		return () => {
			stopSessionRef.current.mutate({ sessionId });
		};
	}, [sessionId, cwd, workspaceId, existingSession, paneId, tabId]);

	useEffect(() => {
		if (sessionReady && config?.proxyUrl && config?.authToken) {
			doConnect();
		}
	}, [sessionReady, config?.proxyUrl, config?.authToken, doConnect]);

	const handleRename = useCallback(
		(title: string) => {
			renameSessionRef.current.mutate({ sessionId, title });
		},
		[sessionId],
	);

	const { allMessages } = useClaudeCodeHistory({
		sessionId,
		liveMessages: messages,
		onRename: handleRename,
	});

	const handleSend = useCallback(
		(message: { text: string }) => {
			if (!message.text.trim()) return;
			setIsSending(true);
			sendMessage(message.text)
				.then(() => {
					// Trigger the local agent to process the message
					triggerAgent.mutate({ sessionId, text: message.text });
				})
				.catch((err) => {
					console.error("[chat] Send failed:", err);
					setIsSending(false);
				});
		},
		[sendMessage, triggerAgent, sessionId],
	);

	// Clear isSending once the server starts streaming (isLoading takes over)
	useEffect(() => {
		if (isLoading) {
			setIsSending(false);
		}
	}, [isLoading]);

	const handleApprove = useCallback(
		(approvalId: string) => {
			approveToolUse.mutate({
				sessionId,
				toolUseId: approvalId,
				approved: true,
			});
			addToolApprovalResponse({ id: approvalId, approved: true });
		},
		[approveToolUse, sessionId, addToolApprovalResponse],
	);

	const handleDeny = useCallback(
		(approvalId: string) => {
			approveToolUse.mutate({
				sessionId,
				toolUseId: approvalId,
				approved: false,
			});
			addToolApprovalResponse({ id: approvalId, approved: false });
		},
		[approveToolUse, sessionId, addToolApprovalResponse],
	);

	const handleAnswer = useCallback(
		(toolUseId: string, answers: Record<string, string>) => {
			addToolAnswerResponse({ toolCallId: toolUseId, answers }).catch((err) => {
				console.error("[chat] Failed to submit answer:", err);
			});
		},
		[addToolAnswerResponse],
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

	const handlePermissionModeSelect = useCallback(
		(mode: PermissionMode) => {
			setPermissionMode(mode);
			updateConfig.mutate({
				sessionId,
				permissionMode: mode,
			});
		},
		[sessionId, updateConfig],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsSending(false);
			interruptAgent.mutate({ sessionId });
			stop();
		},
		[interruptAgent, sessionId, stop],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			handleSend({ text: `/${command.name}` });
		},
		[handleSend],
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
								onAnswer={handleAnswer}
							/>
						))
					)}
					{(isSending || isLoading) && (
						<Message from="assistant">
							<Shimmer className="text-sm text-muted-foreground" duration={1}>
								Thinking...
							</Shimmer>
						</Message>
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="border-t bg-background px-4 py-3">
				<div className="mx-auto w-full max-w-3xl">
					{error &&
						(() => {
							const { message, code } = StreamError.friendly(error);
							return (
								<div className="select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive mb-3">
									{message}
									{code && <span className="ml-1 opacity-50">({code})</span>}
								</div>
							);
						})()}
					<PromptInputProvider>
						<FileMentionProvider cwd={cwd}>
							<SlashCommandInput
								onCommandSend={handleSlashCommandSend}
								cwd={cwd}
							>
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
												<PermissionModePicker
													selectedMode={permissionMode}
													onSelectMode={handlePermissionModeSelect}
												/>
											</PromptInputTools>
											<div className="flex items-center gap-1">
												<ContextIndicator
													collections={collections}
													modelId={selectedModel.id}
												/>
												<PromptInputSubmit
													status={
														isSending || isLoading ? "streaming" : undefined
													}
													onClick={
														isSending || isLoading ? handleStop : undefined
													}
												/>
											</div>
										</PromptInputFooter>
									</PromptInput>
								</FileMentionAnchor>
							</SlashCommandInput>
						</FileMentionProvider>
					</PromptInputProvider>
				</div>
			</div>
		</div>
	);
}
