import {
	createSessionDB,
	DurableChatTransport,
} from "@superset/durable-session";
import { useChatMetadata } from "@superset/durable-session/react";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { MessageList } from "./components/MessageList";
import { DEFAULT_MODEL } from "./constants";
import type { SlashCommand } from "@superset/durable-session/react";
import type {
	ChatInterfaceProps,
	ModelOption,
	PermissionMode,
} from "./types";

const apiUrl = env.NEXT_PUBLIC_API_URL;

export function ChatInterface({ sessionId, cwd }: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [error, setError] = useState<string | null>(null);

	// SessionDB: one SSE connection, reactive TanStack DB collections
	const sessionDB = useMemo(() => {
		return createSessionDB({
			sessionId,
			baseUrl: `${apiUrl}/api/streams`,
		});
	}, [sessionId]);

	// Session metadata: config, title, presence
	const metadata = useChatMetadata({
		sessionDB,
		proxyUrl: apiUrl,
		sessionId,
	});

	// Post initial config on mount
	const registeredRef = useRef(false);
	useEffect(() => {
		if (registeredRef.current) return;
		registeredRef.current = true;
		metadata.updateConfig({
			model: selectedModel.id,
			permissionMode,
			thinkingEnabled,
			cwd,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId]);

	// Post config when settings change
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
		metadata.updateConfig({
			model: selectedModel.id,
			permissionMode,
			thinkingEnabled,
			cwd,
		});
	}, [selectedModel.id, permissionMode, thinkingEnabled, sessionId, cwd, metadata]);

	// DurableChatTransport: bridges SessionDB -> useChat
	// Abort is handled internally by the transport (sends control event)
	const transport = useMemo(() => {
		if (!sessionDB) return undefined;
		return new DurableChatTransport({
			proxyUrl: apiUrl,
			sessionId,
			sessionDB,
		});
	}, [sessionId, sessionDB]);

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
			// chat.stop() triggers abort signal -> transport sends control event
			chat.stop();
		},
		[chat],
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
				availableModels={metadata.config.availableModels ?? []}
				selectedModel={selectedModel}
				setSelectedModel={setSelectedModel}
				modelSelectorOpen={modelSelectorOpen}
				setModelSelectorOpen={setModelSelectorOpen}
				permissionMode={permissionMode}
				setPermissionMode={setPermissionMode}
				thinkingEnabled={thinkingEnabled}
				setThinkingEnabled={setThinkingEnabled}
				slashCommands={metadata.config.slashCommands ?? []}
				onSend={handleSend}
				onStop={handleStop}
				onSlashCommandSend={handleSlashCommandSend}
			/>
		</div>
	);
}
