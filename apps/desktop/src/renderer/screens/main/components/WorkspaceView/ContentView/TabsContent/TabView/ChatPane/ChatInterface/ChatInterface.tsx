import {
	createSessionDB,
	DurableChatTransport,
} from "@superset/durable-session";
import { useChat } from "@ai-sdk/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { MessageList } from "./components/MessageList";
import { ToolApprovalBar } from "./components/ToolApprovalBar";
import { DEFAULT_MODEL } from "./constants";
import type { SlashCommand } from "./hooks/useSlashCommands";
import { useToolApproval } from "./hooks/useToolApproval";
import type {
	ChatInterfaceProps,
	ModelOption,
	PermissionMode,
	TokenUsage,
} from "./types";
import { adaptUIMessages } from "./utils/adapt-ui-message";

export function ChatInterface({ sessionId, cwd }: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
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

	// Fetch proxy config from main process
	const { data: config } = electronTrpc.aiChat.getConfig.useQuery();

	// tRPC mutation to trigger the agent on the desktop main process
	const triggerAgent = electronTrpc.aiChat.superagent.useMutation({
		onError: (err) => {
			console.error("[chat] Agent trigger failed:", err);
			setError(err.message);
		},
	});
	const abortAgent = electronTrpc.aiChat.abortSuperagent.useMutation();

	// Ref holds current settings so the transport callback doesn't go stale
	const settingsRef = useRef({
		sessionId,
		selectedModel,
		cwd,
		permissionMode,
		thinkingEnabled,
	});
	settingsRef.current = {
		sessionId,
		selectedModel,
		cwd,
		permissionMode,
		thinkingEnabled,
	};

	// Stable ref for triggerAgent.mutate — tRPC mutation object is stable but we ref it for safety
	const triggerAgentRef = useRef(triggerAgent);
	triggerAgentRef.current = triggerAgent;

	// SessionDB: one SSE connection, reactive TanStack DB collections
	const sessionDB = useMemo(() => {
		if (!config?.proxyUrl) return null;
		return createSessionDB({
			sessionId,
			baseUrl: config.proxyUrl,
			headers: config.authToken
				? { Authorization: `Bearer ${config.authToken}` }
				: undefined,
		});
	}, [sessionId, config?.proxyUrl, config?.authToken]);

	// DurableChatTransport: bridges SessionDB → useChat
	const transport = useMemo(() => {
		if (!config?.proxyUrl || !sessionDB) return undefined;
		return new DurableChatTransport({
			proxyUrl: config.proxyUrl,
			sessionId,
			headers: config.authToken
				? { Authorization: `Bearer ${config.authToken}` }
				: undefined,
			sessionDB,
			onSend: (text) => {
				const s = settingsRef.current;
				triggerAgentRef.current.mutate({
					sessionId: s.sessionId,
					text,
					modelId: s.selectedModel.id,
					cwd: s.cwd,
					permissionMode: s.permissionMode,
					thinkingEnabled: s.thinkingEnabled,
				});
			},
		});
	}, [sessionId, config?.proxyUrl, config?.authToken, sessionDB]);

	// useChat: AI SDK v5 hook with custom transport
	const chat = useChat({
		id: sessionId,
		transport,
		experimental_throttle: 50,
	});

	const isStreaming = chat.status === "streaming" || chat.status === "submitted";

	// Adapt UIMessage[] → ChatMessage[] for the existing rendering pipeline
	const messages = useMemo(
		() => adaptUIMessages(chat.messages),
		[chat.messages],
	);

	// Tool approval state + handlers (stays via tRPC for now)
	const {
		pendingApproval,
		setPendingApproval,
		handleApprove,
		handleAlwaysAllow,
		handleDecline,
		handleAnswer,
	} = useToolApproval({ sessionId, setPermissionMode, setMessages: () => {} });

	// Send: delegate to useChat which calls transport.sendMessages → onSend → tRPC
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

			chat.sendMessage({ text });
		},
		[chat, setPendingApproval],
	);

	// Stop: abort via tRPC + useChat.stop()
	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			abortAgent.mutate({ sessionId });
			chat.stop();
		},
		[abortAgent, sessionId, chat],
	);

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
		</div>
	);
}
