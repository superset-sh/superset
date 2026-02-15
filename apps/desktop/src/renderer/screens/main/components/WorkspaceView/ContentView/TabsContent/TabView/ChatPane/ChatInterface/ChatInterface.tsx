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
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { HiMiniChatBubbleLeftRight, HiMiniPaperClip } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	FileMentionAnchor,
	FileMentionProvider,
	FileMentionTrigger,
} from "./components/FileMentionPopover";
import { MessagePartsRenderer } from "./components/MessagePartsRenderer";
import { ModelPicker } from "./components/ModelPicker";
import { PermissionModePicker } from "./components/PermissionModePicker";
import { SlashCommandInput } from "./components/SlashCommandInput";
import { ToolApprovalBar } from "./components/ToolApprovalBar";
import { DEFAULT_MODEL } from "./constants";
import type { SlashCommand } from "./hooks/useSlashCommands";
import { useSuperagentStream } from "./hooks/useSuperagentStream";
import type {
	ChatInterfaceProps,
	ChatMessage,
	ModelOption,
	PermissionMode,
	TokenUsage,
	ToolApprovalRequest,
} from "./types";
import { hydrateMessages } from "./utils/hydrate-messages";

export function ChatInterface({ sessionId, cwd }: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [isStreaming, setIsStreaming] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [error, setError] = useState<string | null>(null);

	// Token usage tracking (accumulated across steps in the current turn)
	const [turnUsage, setTurnUsage] = useState<TokenUsage>({
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
	});
	const [sessionUsage, setSessionUsage] = useState<TokenUsage>({
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
	});

	// Tool approval state
	const [pendingApproval, setPendingApproval] =
		useState<ToolApprovalRequest | null>(null);

	// Load conversation history from Mastra Memory
	const { data: historyMessages } = electronTrpc.aiChat.getMessages.useQuery(
		{ threadId: sessionId },
		{ enabled: !!sessionId },
	);

	useEffect(() => {
		if (!historyMessages || historyMessages.length === 0) return;
		setMessages(
			hydrateMessages(historyMessages as Array<Record<string, unknown>>),
		);
	}, [historyMessages]);

	const { activeAgentCallIdRef, runIdRef, endStream } = useSuperagentStream({
		sessionId,
		setMessages,
		setIsStreaming,
		setError,
		setTurnUsage,
		setSessionUsage,
		setPendingApproval,
	});

	const triggerAgent = electronTrpc.aiChat.superagent.useMutation({
		onError: (err) => {
			console.error("[chat] Agent trigger failed:", err);
			endStream(err.message);
		},
	});

	const abortAgent = electronTrpc.aiChat.abortSuperagent.useMutation();
	const approveToolCallMutation =
		electronTrpc.aiChat.approveToolCall.useMutation();
	const answerQuestionMutation =
		electronTrpc.aiChat.answerQuestion.useMutation();

	const handleSend = useCallback(
		(message: { text: string }) => {
			const text = message.text.trim();
			if (!text) return;

			setError(null);
			setTurnUsage({
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
			});
			setPendingApproval(null);
			runIdRef.current = null;

			setMessages((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					role: "user",
					parts: [{ type: "text", text }],
				},
				{
					id: crypto.randomUUID(),
					role: "assistant",
					parts: [],
				},
			]);

			activeAgentCallIdRef.current = null;
			setIsStreaming(true);
			triggerAgent.mutate({
				sessionId,
				text,
				modelId: selectedModel.id,
				cwd,
				permissionMode,
				thinkingEnabled,
			});
		},
		[
			triggerAgent,
			sessionId,
			selectedModel.id,
			cwd,
			permissionMode,
			thinkingEnabled,
			activeAgentCallIdRef,
			runIdRef,
		],
	);

	const handleModelSelect = useCallback((model: ModelOption) => {
		setSelectedModel(model);
	}, []);

	const handlePermissionModeSelect = useCallback((mode: PermissionMode) => {
		setPermissionMode(mode);
	}, []);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			abortAgent.mutate({ sessionId });
			setIsStreaming(false);
		},
		[abortAgent, sessionId],
	);

	const handleApprove = useCallback(() => {
		if (!pendingApproval) return;
		approveToolCallMutation.mutate({
			sessionId,
			runId: pendingApproval.runId,
			approved: true,
		});
		setPendingApproval(null);
	}, [pendingApproval, approveToolCallMutation, sessionId]);

	const handleAlwaysAllow = useCallback(() => {
		if (!pendingApproval) return;
		setPermissionMode("bypassPermissions");
		approveToolCallMutation.mutate({
			sessionId,
			runId: pendingApproval.runId,
			approved: true,
			permissionMode: "bypassPermissions",
		});
		setPendingApproval(null);
	}, [pendingApproval, approveToolCallMutation, sessionId]);

	const handleDecline = useCallback(() => {
		if (!pendingApproval) return;
		approveToolCallMutation.mutate({
			sessionId,
			runId: pendingApproval.runId,
			approved: false,
		});
		setPendingApproval(null);
	}, [pendingApproval, approveToolCallMutation, sessionId]);

	const handleAnswer = useCallback(
		(toolCallId: string, answers: Record<string, string>) => {
			// Update local state to mark the tool call as answered
			setMessages((prev) =>
				prev.map((msg) => {
					if (msg.role !== "assistant") return msg;
					return {
						...msg,
						parts: msg.parts.map((part) =>
							part.type === "tool-call" && part.toolCallId === toolCallId
								? {
										...part,
										status: "done" as const,
										result: { answers },
									}
								: part,
						),
					};
				}),
			);

			// Resume the agent stream with answers injected into RequestContext
			if (pendingApproval) {
				answerQuestionMutation.mutate({
					sessionId,
					runId: pendingApproval.runId,
					answers,
				});
				setPendingApproval(null);
			}
		},
		[pendingApproval, answerQuestionMutation, sessionId],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			handleSend({ text: `/${command.name}` });
		},
		[handleSend],
	);

	return (
		<div className="flex h-full flex-col bg-background">
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
										{isLastAssistant &&
										isStreaming &&
										msg.parts.length === 0 ? (
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
												onAnswer={handleAnswer}
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

			{pendingApproval && pendingApproval.toolName !== "ask_user_question" && (
				<ToolApprovalBar
					pendingApproval={pendingApproval}
					onApprove={handleApprove}
					onDecline={handleDecline}
					onAlwaysAllow={handleAlwaysAllow}
				/>
			)}

			<div className="border-t bg-background px-4 py-3">
				<div className="mx-auto w-full max-w-3xl">
					{error && (
						<div className="mb-3 select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
							{error}
						</div>
					)}
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
													onToggle={setThinkingEnabled}
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
											<div className="flex items-center gap-2">
												{sessionUsage.totalTokens > 0 && (
													<span
														className="text-[10px] tabular-nums text-muted-foreground"
														title={`Turn: ${turnUsage.totalTokens.toLocaleString()} tokens | Session: ${sessionUsage.totalTokens.toLocaleString()} tokens`}
													>
														{turnUsage.totalTokens > 0 && isStreaming
															? `${turnUsage.totalTokens.toLocaleString()} tok`
															: `${sessionUsage.totalTokens.toLocaleString()} tok`}
													</span>
												)}
												<PromptInputSubmit
													status={isStreaming ? "streaming" : undefined}
													onClick={isStreaming ? handleStop : undefined}
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
