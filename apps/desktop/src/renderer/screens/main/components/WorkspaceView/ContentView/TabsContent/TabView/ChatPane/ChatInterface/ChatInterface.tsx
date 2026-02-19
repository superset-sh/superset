import { acquireSessionDB } from "@superset/durable-session";
import type { SlashCommand } from "@superset/durable-session/react";
import { useDurableChat } from "@superset/durable-session/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
	const [pendingMessage, setPendingMessage] = useState<string | null>(null);

	if (props.sessionId) {
		return (
			<ActiveChatInterface
				{...props}
				sessionId={props.sessionId}
				pendingMessage={pendingMessage}
				clearPendingMessage={() => setPendingMessage(null)}
			/>
		);
	}
	return <EmptyChatInterface {...props} onMessageSent={setPendingMessage} />;
}

function EmptyChatInterface({
	organizationId,
	deviceId,
	cwd,
	paneId,
	onMessageSent,
}: ChatInterfaceProps & { onMessageSent: (text: string) => void }) {
	const switchChatSession = useTabsStore((s) => s.switchChatSession);
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [error, setError] = useState<string | null>(null);
	const [sentMessage, setSentMessage] = useState<string | null>(null);

	const handleSend = useCallback(
		(message: { text: string }) => {
			const text = message.text.trim();
			if (!text || !organizationId) return;

			setError(null);

			// Show the message in the UI immediately — no awaits before this.
			setSentMessage(text);

			// All network work happens in the background.
			const newSessionId = crypto.randomUUID();
			createSession(newSessionId, organizationId, deviceId)
				.then(() => {
					// Config is fire-and-forget
					fetch(`${apiUrl}/api/streams/v1/sessions/${newSessionId}/config`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...getAuthHeaders(),
						},
						body: JSON.stringify({
							model: selectedModel.id,
							permissionMode,
							thinkingEnabled,
							cwd,
						}),
					});

					// Pre-warm cache AFTER session exists on server
					acquireSessionDB({
						sessionId: newSessionId,
						baseUrl: `${apiUrl}/api/streams`,
						headers: getAuthHeaders(),
					});

					// Hand off to ActiveChatInterface
					onMessageSent(text);
					switchChatSession(paneId, newSessionId);
				})
				.catch((err) => {
					setSentMessage(null);
					setError(
						err instanceof Error ? err.message : "Failed to create session",
					);
				});
		},
		[
			organizationId,
			deviceId,
			paneId,
			switchChatSession,
			onMessageSent,
			selectedModel.id,
			permissionMode,
			thinkingEnabled,
			cwd,
		],
	);

	const displayMessages = sentMessage
		? [
				{
					id: "pending",
					role: "user" as const,
					parts: [{ type: "text" as const, text: sentMessage }],
					createdAt: new Date(),
				},
			]
		: [];

	return (
		<div className="flex h-full flex-col bg-background">
			<MessageList messages={displayMessages} isStreaming={!!sentMessage} />
			<ChatInputFooter
				cwd={cwd}
				error={error}
				isStreaming={!!sentMessage}
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
// ActiveChatInterface — self-contained via useDurableChat
// ---------------------------------------------------------------------------

function ActiveChatInterface({
	sessionId,
	cwd,
	pendingMessage,
	clearPendingMessage,
}: Omit<ChatInterfaceProps, "sessionId"> & {
	sessionId: string;
	pendingMessage: string | null;
	clearPendingMessage: () => void;
}) {
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");

	const {
		ready,
		messages,
		isLoading: isStreaming,
		sendMessage,
		stop,
		error,
		metadata,
	} = useDurableChat({
		sessionId,
		proxyUrl: apiUrl,
		getHeaders: getAuthHeaders,
	});

	// Once ready, send the pending message through useDurableChat's optimistic
	// path — the optimistic insert replaces the synthetic message seamlessly.
	const sentPendingRef = useRef(false);
	useEffect(() => {
		if (!ready || !pendingMessage || sentPendingRef.current) return;
		sentPendingRef.current = true;
		sendMessage(pendingMessage);
		clearPendingMessage();
	}, [ready, pendingMessage, sendMessage, clearPendingMessage]);

	// Show pending message immediately while useDurableChat preloads.
	// Once sendMessage's optimistic insert fires, `messages` populates
	// and the synthetic entry is no longer needed.
	const displayMessages =
		messages.length === 0 && pendingMessage
			? [
					{
						id: "pending",
						role: "user" as const,
						parts: [{ type: "text" as const, text: pendingMessage }],
						createdAt: new Date(),
					},
				]
			: messages;

	const registeredRef = useRef(false);
	useEffect(() => {
		if (!ready || registeredRef.current) return;
		registeredRef.current = true;
		metadata.updateConfig({
			model: selectedModel.id,
			permissionMode,
			thinkingEnabled,
			cwd,
		});
	}, [
		ready,
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
			sendMessage(text);
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
			<MessageList
				messages={displayMessages}
				isStreaming={isStreaming || !!pendingMessage}
			/>
			<ChatInputFooter
				cwd={cwd}
				error={error}
				isStreaming={isStreaming || !!pendingMessage}
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
