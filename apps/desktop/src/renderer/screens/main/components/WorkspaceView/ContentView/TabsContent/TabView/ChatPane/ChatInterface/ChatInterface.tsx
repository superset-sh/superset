import {
	createSessionDB,
	DurableChatTransport,
	materializeInitialMessages,
	type ChunkRow,
	type SessionDB,
} from "@superset/durable-session";
import type { SlashCommand } from "@superset/durable-session/react";
import { useChatMetadata } from "@superset/durable-session/react";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { getAuthToken } from "renderer/lib/auth-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { MessageList } from "./components/MessageList";
import { DEFAULT_MODEL } from "./constants";
import type { ChatInterfaceProps, ModelOption, PermissionMode } from "./types";

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

// ---------------------------------------------------------------------------
// ActiveChatInterface — handles preload, then delegates to ChatSession
// ---------------------------------------------------------------------------

function ActiveChatInterface({
	sessionId,
	cwd,
}: Omit<ChatInterfaceProps, "sessionId"> & { sessionId: string }) {
	const [ready, setReady] = useState(false);

	const sessionDB = useMemo(() => {
		return createSessionDB({
			sessionId,
			baseUrl: `${apiUrl}/api/streams`,
			headers: getAuthHeaders(),
		});
	}, [sessionId]);

	useEffect(() => {
		let cancelled = false;
		sessionDB
			.preload()
			.then(() => {
				if (!cancelled) setReady(true);
			})
			.catch((err) => console.error("[ChatInterface] preload failed:", err));
		return () => {
			cancelled = true;
			setReady(false);
			sessionDB.close();
		};
	}, [sessionDB]);

	if (!ready) {
		return (
			<div className="flex h-full flex-col items-center justify-center bg-background">
				<p className="text-muted-foreground text-sm">Connecting…</p>
			</div>
		);
	}

	return <ChatSession sessionId={sessionId} sessionDB={sessionDB} cwd={cwd} />;
}

// ---------------------------------------------------------------------------
// ChatSession — only mounts after preload is complete (no re-render storm)
// ---------------------------------------------------------------------------

function ChatSession({
	sessionId,
	sessionDB,
	cwd,
}: {
	sessionId: string;
	sessionDB: SessionDB;
	cwd: string;
}) {
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");

	const transport = useMemo(
		() =>
			new DurableChatTransport({
				proxyUrl: apiUrl,
				sessionId,
				sessionDB,
				getHeaders: getAuthHeaders,
			}),
		[sessionId, sessionDB],
	);

	const initialMessages = useMemo(
		() =>
			materializeInitialMessages(
				sessionDB.collections.chunks.values() as Iterable<ChunkRow>,
			),
		[sessionDB],
	);

	const { messages, status, sendMessage, stop, error } = useChat({
		id: sessionId,
		messages: initialMessages,
		transport,
		resume: true,
	});

	const isStreaming = status === "streaming" || status === "submitted";

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
	}, [
		cwd,
		metadata.updateConfig,
		permissionMode,
		selectedModel.id,
		thinkingEnabled,
	]);

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
	}, [
		selectedModel.id,
		permissionMode,
		thinkingEnabled,
		cwd,
		metadata.updateConfig,
	]);

	const handleSend = useCallback(
		(message: { text: string }) => {
			const text = message.text.trim();
			if (!text) return;
			sendMessage({ text });
		},
		[sendMessage],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			stop();
		},
		[stop],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			handleSend({ text: `/${command.name}` });
		},
		[handleSend],
	);

	return (
		<div className="flex h-full flex-col bg-background">
			<MessageList messages={messages} isStreaming={isStreaming} />
			<ChatInputFooter
				cwd={cwd}
				error={error?.message ?? null}
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
