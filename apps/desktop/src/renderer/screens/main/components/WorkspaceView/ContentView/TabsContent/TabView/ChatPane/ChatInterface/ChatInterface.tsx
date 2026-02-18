import { useCallback, useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AuthPrompt } from "./components/AuthPrompt";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { MessageList } from "./components/MessageList";
import { ToolApprovalBar } from "./components/ToolApprovalBar";
import { DEFAULT_MODEL } from "./constants";
import { useChatActions } from "./hooks/useChatActions";
import type { SlashCommand } from "./hooks/useSlashCommands";
import { useSuperagentStream } from "./hooks/useSuperagentStream";
import { useToolApproval } from "./hooks/useToolApproval";
import type {
	ChatInterfaceProps,
	ChatMessage,
	ModelOption,
	PermissionMode,
	TokenUsage,
} from "./types";
import { hydrateMessages } from "./utils/hydrate-messages";

export function ChatInterface({ sessionId, cwd }: ChatInterfaceProps) {
	const { data: authStatus } = electronTrpc.aiChat.getAuthStatus.useQuery();

	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [isStreaming, setIsStreaming] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [error, setError] = useState<string | null>(null);
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

	// 1. Tool approval state + handlers
	const {
		pendingApproval,
		setPendingApproval,
		handleApprove,
		handleAlwaysAllow,
		handleDecline,
		handleAnswer,
	} = useToolApproval({ sessionId, setPermissionMode, setMessages });

	// 2. Stream subscription (depends on setPendingApproval)
	const { activeAgentCallIdRef, runIdRef, endStream } = useSuperagentStream({
		sessionId,
		setMessages,
		setIsStreaming,
		setError,
		setTurnUsage,
		setSessionUsage,
		setPendingApproval,
	});

	// 3. Send + stop actions (depends on refs + endStream)
	const { handleSend, handleStop } = useChatActions({
		sessionId,
		selectedModel,
		cwd,
		permissionMode,
		thinkingEnabled,
		setIsStreaming,
		setMessages,
		setError,
		setTurnUsage,
		setPendingApproval,
		activeAgentCallIdRef,
		runIdRef,
		endStream,
	});

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			handleSend({ text: `/${command.name}` });
		},
		[handleSend],
	);

	return (
		<div className="flex h-full flex-col bg-background">
			<MessageList
				messages={messages}
				isStreaming={isStreaming}
				onAnswer={handleAnswer}
			/>

			{pendingApproval && pendingApproval.toolName !== "ask_user_question" && (
				<ToolApprovalBar
					pendingApproval={pendingApproval}
					onApprove={handleApprove}
					onDecline={handleDecline}
					onAlwaysAllow={handleAlwaysAllow}
				/>
			)}

			{authStatus?.authenticated === false ? (
				<AuthPrompt />
			) : (
				<ChatInputFooter
					cwd={cwd}
					error={error}
					isStreaming={isStreaming}
					selectedModel={selectedModel}
					setSelectedModel={setSelectedModel}
					modelSelectorOpen={modelSelectorOpen}
					setModelSelectorOpen={setModelSelectorOpen}
					permissionMode={permissionMode}
					setPermissionMode={setPermissionMode}
					thinkingEnabled={thinkingEnabled}
					setThinkingEnabled={setThinkingEnabled}
					turnUsage={turnUsage}
					sessionUsage={sessionUsage}
					onSend={handleSend}
					onStop={handleStop}
					onSlashCommandSend={handleSlashCommandSend}
				/>
			)}
		</div>
	);
}
