import { acquireSessionDB } from "@superset/durable-session";
import type { SlashCommand } from "@superset/durable-session/react";
import { useDurableChat } from "@superset/durable-session/react";
import type { PromptInputMessage } from "@superset/ui/ai-elements/prompt-input";
import { PromptInputProvider } from "@superset/ui/ai-elements/prompt-input";
import type { FileUIPart } from "ai";
import type React from "react";
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
	await fetch(`${apiUrl}/api/chat/${sessionId}`, {
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

async function uploadFile(
	sessionId: string,
	file: FileUIPart,
): Promise<FileUIPart> {
	// Convert the data URL to a File object for upload
	const response = await fetch(file.url);
	const blob = await response.blob();
	const filename = file.filename || "attachment";

	const formData = new FormData();
	formData.append("file", new File([blob], filename, { type: file.mediaType }));

	const token = getAuthToken();
	const res = await fetch(`${apiUrl}/api/chat/${sessionId}/attachments`, {
		method: "POST",
		headers: token ? { Authorization: `Bearer ${token}` } : {},
		body: formData,
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: "Upload failed" }));
		throw new Error(err.error || `Upload failed: ${res.status}`);
	}

	const result: { url: string; mediaType: string; filename?: string } =
		await res.json();
	return { type: "file", ...result };
}

export function ChatInterface(props: ChatInterfaceProps) {
	const [pendingMessage, setPendingMessage] = useState<string | null>(null);
	const [pendingFiles, setPendingFiles] = useState<FileUIPart[]>([]);

	if (props.sessionId) {
		return (
			<ActiveChatInterface
				{...props}
				sessionId={props.sessionId}
				pendingMessage={pendingMessage}
				pendingFiles={pendingFiles}
				clearPendingMessage={() => {
					setPendingMessage(null);
					setPendingFiles([]);
				}}
			/>
		);
	}
	return (
		<EmptyChatInterface
			{...props}
			onMessageSent={(text, files) => {
				setPendingMessage(text);
				setPendingFiles(files);
			}}
		/>
	);
}

function EmptyChatInterface({
	organizationId,
	deviceId,
	workspaceId,
	cwd,
	paneId,
	onMessageSent,
}: ChatInterfaceProps & {
	onMessageSent: (text: string, files: FileUIPart[]) => void;
}) {
	const switchChatSession = useTabsStore((s) => s.switchChatSession);
	const [selectedModel, setSelectedModel] =
		useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [error, setError] = useState<string | null>(null);
	const [sentMessage, setSentMessage] = useState<{
		text: string;
		files: FileUIPart[];
	} | null>(null);

	const handleSend = useCallback(
		(message: PromptInputMessage) => {
			const text = message.text.trim();
			const files = message.files ?? [];
			if (!text && files.length === 0) return;
			if (!organizationId) return;

			setError(null);
			setSentMessage({ text, files });

			const newSessionId = crypto.randomUUID();
			createSession(newSessionId, organizationId, deviceId)
				.then(async () => {
					// Config is fire-and-forget
					fetch(`${apiUrl}/api/chat/${newSessionId}/stream/config`, {
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

					// Upload files immediately
					let uploadedFiles: FileUIPart[] = [];
					if (files.length > 0) {
						const results = await Promise.all(
							files.map((f) => uploadFile(newSessionId, f)),
						);
						uploadedFiles = results;
					}

					// Pre-warm cache AFTER session exists on server
					acquireSessionDB({
						sessionId: newSessionId,
						baseUrl: `${apiUrl}/api/chat`,
						headers: getAuthHeaders(),
					});

					onMessageSent(text, uploadedFiles);
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
					parts: [
						...(sentMessage.text
							? [{ type: "text" as const, text: sentMessage.text }]
							: []),
						...sentMessage.files,
					],
					createdAt: new Date(),
				},
			]
		: [];

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<MessageList
					messages={displayMessages}
					isStreaming={!!sentMessage}
					workspaceId={workspaceId}
				/>
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
		</PromptInputProvider>
	);
}

// ---------------------------------------------------------------------------
// ActiveChatInterface — self-contained via useDurableChat
// ---------------------------------------------------------------------------

function ActiveChatInterface({
	sessionId,
	workspaceId,
	cwd,
	pendingMessage,
	pendingFiles,
	clearPendingMessage,
}: Omit<ChatInterfaceProps, "sessionId"> & {
	sessionId: string;
	pendingMessage: string | null;
	pendingFiles: FileUIPart[];
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
		if (!ready || sentPendingRef.current) return;
		if (!pendingMessage && pendingFiles.length === 0) return;
		sentPendingRef.current = true;
		sendMessage(
			pendingMessage ?? "",
			pendingFiles.length > 0 ? pendingFiles : undefined,
		);
		clearPendingMessage();
	}, [ready, pendingMessage, pendingFiles, sendMessage, clearPendingMessage]);

	// Show pending message immediately while useDurableChat preloads.
	const displayMessages =
		messages.length === 0 && (pendingMessage || pendingFiles.length > 0)
			? [
					{
						id: "pending",
						role: "user" as const,
						parts: [
							...(pendingMessage
								? [{ type: "text" as const, text: pendingMessage }]
								: []),
							...pendingFiles,
						],
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
		async (message: PromptInputMessage) => {
			const text = message.text.trim();
			const files = message.files ?? [];
			if (!text && files.length === 0) return;

			// Upload files immediately before sending the message
			let uploadedFiles: FileUIPart[] | undefined;
			if (files.length > 0) {
				const results = await Promise.all(
					files.map((f) => uploadFile(sessionId, f)),
				);
				uploadedFiles = results;
			}

			sendMessage(text, uploadedFiles);
		},
		[sendMessage, sessionId],
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
			handleSend({ text: `/${command.name}`, files: [] });
		},
		[handleSend],
	);

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<MessageList
					messages={displayMessages}
					isStreaming={isStreaming || !!pendingMessage}
					workspaceId={workspaceId}
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
		</PromptInputProvider>
	);
}
