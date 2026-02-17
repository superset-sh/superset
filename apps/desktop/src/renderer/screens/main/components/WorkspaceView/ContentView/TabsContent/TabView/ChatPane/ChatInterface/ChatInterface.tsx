import {
	createSessionDB,
	DurableChatTransport,
} from "@superset/durable-session";
import { useChat } from "@ai-sdk/react";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { adaptUIMessages } from "./utils/adapt-ui-message";

export function ChatInterface({ sessionId, cwd }: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [error, setError] = useState<string | null>(null);

	const { data: config } = electronTrpc.aiChat.getConfig.useQuery();

	// tRPC mutation to trigger the agent on the desktop main process
	// TODO: Replace with StreamWatcher (Phase 4) — the desktop main process
	// should detect new user messages in the durable stream and trigger the
	// agent automatically, instead of the renderer calling tRPC.
	const triggerAgent = electronTrpc.aiChat.superagent.useMutation({
		onError: (err) => {
			console.error("[chat] Agent trigger failed:", err);
			setError(err.message);
		},
	});
	const abortAgent = electronTrpc.aiChat.abortSuperagent.useMutation();

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
	const triggerAgentRef = useRef(triggerAgent);
	triggerAgentRef.current = triggerAgent;

	// SessionDB: one SSE connection, reactive TanStack DB collections
	// Auth is handled by Better Auth cookies (credentials: "include")
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

	// TODO: Remove this adapter — update MessageList/MessagePartsRenderer to
	// use UIMessage parts directly instead of the legacy ChatMessage types.
	const messages = useMemo(
		() => adaptUIMessages(chat.messages),
		[chat.messages],
	);

	// TODO: Tool approvals and ask_user_question should use AI SDK's
	// chat.addToolOutput() to send results back through the transport.
	// The old useToolApproval hook was broken (setPendingApproval never called).

	const handleSend = useCallback(
		(message: { text: string }) => {
			const text = message.text.trim();
			if (!text) return;

			setError(null);

			// Write user message to durable stream via transport
			chat.sendMessage({ text });

			// Trigger agent on desktop main process
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
				messages={messages}
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
