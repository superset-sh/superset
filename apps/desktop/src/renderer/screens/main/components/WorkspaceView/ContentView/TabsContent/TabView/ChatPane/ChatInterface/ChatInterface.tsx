import {
	createSessionDB,
	DurableChatTransport,
} from "@superset/durable-session";
import { useChatMetadata } from "@superset/durable-session/react";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { getAuthToken } from "renderer/lib/auth-client";
import { useTabsStore } from "renderer/stores/tabs/store";
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

function getAuthHeaders(): Record<string, string> {
	const token = getAuthToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function createSession(
	sessionId: string,
	organizationId: string,
	deviceId: string | null,
): Promise<void> {
	const token = getAuthToken();
	await fetch(`${apiUrl}/api/streams/v1/sessions/${sessionId}`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({
			organizationId,
			...(deviceId ? { deviceId } : {}),
		}),
	});
}

export function ChatInterface(props: ChatInterfaceProps) {
	if (props.sessionId) {
		return <ActiveChatInterface {...props} sessionId={props.sessionId} />;
	}
	return <EmptyChatInterface {...props} />;
}

function EmptyChatInterface({
	organizationId,
	deviceId,
	cwd,
	paneId,
}: ChatInterfaceProps) {
	const switchChatSession = useTabsStore((s) => s.switchChatSession);
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [error, setError] = useState<string | null>(null);

	const handleSend = useCallback(
		async (message: { text: string }) => {
			const text = message.text.trim();
			if (!text || !organizationId) return;

			setError(null);
			const newSessionId = crypto.randomUUID();
			await createSession(newSessionId, organizationId, deviceId);

			// Send the first message before switching so it isn't lost
			await fetch(
				`${apiUrl}/api/streams/v1/sessions/${newSessionId}/messages`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...getAuthHeaders(),
					},
					body: JSON.stringify({ content: text }),
				},
			);

			switchChatSession(paneId, newSessionId);
		},
		[organizationId, deviceId, paneId, switchChatSession],
	);

	return (
		<div className="flex h-full flex-col bg-background">
			<MessageList messages={[]} isStreaming={false} />
			<ChatInputFooter
				cwd={cwd}
				error={error}
				isStreaming={false}
				availableModels={[]}
				selectedModel={selectedModel}
				setSelectedModel={setSelectedModel}
				modelSelectorOpen={modelSelectorOpen}
				setModelSelectorOpen={setModelSelectorOpen}
				permissionMode={permissionMode}
				setPermissionMode={setPermissionMode}
				thinkingEnabled={thinkingEnabled}
				setThinkingEnabled={setThinkingEnabled}
				slashCommands={[]}
				onSend={handleSend}
				onStop={() => {}}
				onSlashCommandSend={() => {}}
			/>
		</div>
	);
}

function ActiveChatInterface({
	sessionId,
	cwd,
}: Omit<ChatInterfaceProps, "sessionId"> & { sessionId: string }) {
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [error, setError] = useState<string | null>(null);

	const sessionDB = useMemo(() => {
		return createSessionDB({
			sessionId,
			baseUrl: `${apiUrl}/api/streams`,
			headers: getAuthHeaders(),
		});
	}, [sessionId]);

	const metadata = useChatMetadata({
		sessionDB,
		proxyUrl: apiUrl,
		sessionId,
		getHeaders: getAuthHeaders,
	});

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
	}, [sessionId]);

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
	}, [selectedModel.id, permissionMode, thinkingEnabled, sessionId, cwd, metadata.updateConfig]);

	const transport = useMemo(() => {
		return new DurableChatTransport({
			proxyUrl: apiUrl,
			sessionId,
			sessionDB,
			getHeaders: getAuthHeaders,
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
			chat.sendMessage({ text });
		},
		[chat],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
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
