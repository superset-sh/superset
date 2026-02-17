import {
	createSessionDB,
	DurableChatTransport,
} from "@superset/durable-session";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { MessageList } from "./components/MessageList";
import { DEFAULT_MODEL } from "./constants";
import type { SlashCommand } from "./hooks/useSlashCommands";
import type {
	ChatInterfaceProps,
	ModelOption,
	PermissionMode,
} from "./types";

export function ChatInterface({ sessionId, cwd }: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [error, setError] = useState<string | null>(null);

	const { data: config } = electronTrpc.aiChat.getConfig.useQuery();
	const abortAgent = electronTrpc.aiChat.abortSuperagent.useMutation();

	// Register session with StreamWatcher on main process.
	// The StreamWatcher monitors the durable stream for new user messages
	// and triggers the agent automatically — any client can send a message.
	const registerSession = electronTrpc.aiChat.registerSession.useMutation({
		onError: (err: { message: string }) => {
			console.error("[chat] Session registration failed:", err);
			setError(err.message);
		},
	});
	const updateSessionConfig =
		electronTrpc.aiChat.updateSessionConfig.useMutation();

	// Register on mount
	const registeredRef = useRef(false);
	useEffect(() => {
		if (registeredRef.current) return;
		registeredRef.current = true;
		registerSession.mutate({
			sessionId,
			cwd,
			modelId: selectedModel.id,
			permissionMode,
			thinkingEnabled,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId]);

	// Update config when settings change
	const prevConfigRef = useRef({
		modelId: selectedModel.id,
		permissionMode,
		thinkingEnabled,
	});
	useEffect(() => {
		const prev = prevConfigRef.current;
		if (
			prev.modelId === selectedModel.id &&
			prev.permissionMode === permissionMode &&
			prev.thinkingEnabled === thinkingEnabled
		) {
			return;
		}
		prevConfigRef.current = {
			modelId: selectedModel.id,
			permissionMode,
			thinkingEnabled,
		};
		updateSessionConfig.mutate({
			sessionId,
			modelId: selectedModel.id,
			permissionMode,
			thinkingEnabled,
		});
	}, [selectedModel.id, permissionMode, thinkingEnabled, sessionId, updateSessionConfig]);

	// SessionDB: one SSE connection, reactive TanStack DB collections
	const sessionDB = useMemo(() => {
		if (!config?.apiUrl) return null;
		return createSessionDB({
			sessionId,
			baseUrl: `${config.apiUrl}/api/streams`,
		});
	}, [sessionId, config?.apiUrl]);

	// DurableChatTransport: bridges SessionDB → useChat
	const transport = useMemo(() => {
		if (!config?.apiUrl || !sessionDB) return undefined;
		return new DurableChatTransport({
			proxyUrl: config.apiUrl,
			sessionId,
			sessionDB,
		});
	}, [sessionId, config?.apiUrl, sessionDB]);

	const chat = useChat({
		id: sessionId,
		transport,
		experimental_throttle: 50,
	});

	const isStreaming = chat.status === "streaming" || chat.status === "submitted";

	const handleSend = useCallback(
		(message: { text: string }) => {
			const text = message.text.trim();
			if (!text) return;

			setError(null);

			// Write user message to durable stream via transport.
			// StreamWatcher on main process detects it and triggers the agent.
			chat.sendMessage({ text });
		},
		[chat],
	);

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
				messages={chat.messages}
				isStreaming={isStreaming}
			/>

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
				onSend={handleSend}
				onStop={handleStop}
				onSlashCommandSend={handleSlashCommandSend}
			/>
		</div>
	);
}
