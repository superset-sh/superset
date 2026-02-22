import { chatServiceTrpc, useChat } from "@superset/chat/client";
import type { PromptInputMessage } from "@superset/ui/ai-elements/prompt-input";
import { PromptInputProvider } from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus, FileUIPart } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getAuthToken } from "renderer/lib/auth-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { MessageList } from "./components/MessageList";
import type { SlashCommand } from "./hooks/useSlashCommands";
import type { ChatInterfaceProps, ModelOption, PermissionMode } from "./types";

const apiUrl = env.NEXT_PUBLIC_API_URL;

interface PendingUserMessage {
	id: string;
	text: string;
	files: FileUIPart[];
	createdAt: Date;
}

interface QueuedPendingMessage {
	id: string;
	text: string;
	files: FileUIPart[];
}

function useAvailableModels(): {
	models: ModelOption[];
	defaultModel: ModelOption | null;
} {
	const { data } = useQuery({
		queryKey: ["chat", "models"],
		queryFn: () => apiTrpcClient.chat.getModels.query(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const models = data?.models ?? [];
	return { models, defaultModel: models[0] ?? null };
}

function getAuthHeaders(): Record<string, string> {
	const token = getAuthToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function createSession(
	sessionId: string,
	organizationId: string,
	deviceId: string | null,
	workspaceId?: string,
	signal?: AbortSignal,
): Promise<void> {
	const token = getAuthToken();
	await fetch(`${apiUrl}/api/chat/${sessionId}`, {
		method: "PUT",
		signal,
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({
			organizationId,
			...(deviceId ? { deviceId } : {}),
			...(workspaceId ? { workspaceId } : {}),
		}),
	});
}

async function uploadFile(
	sessionId: string,
	file: FileUIPart,
	signal?: AbortSignal,
): Promise<FileUIPart> {
	const response = await fetch(file.url, { signal });
	const blob = await response.blob();
	const filename = file.filename || "attachment";

	const formData = new FormData();
	formData.append("file", new File([blob], filename, { type: file.mediaType }));

	const token = getAuthToken();
	const res = await fetch(`${apiUrl}/api/chat/${sessionId}/attachments`, {
		method: "POST",
		signal,
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

function isAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === "AbortError";
}

export function ChatInterface({
	sessionId,
	sessionTitle,
	organizationId,
	deviceId,
	workspaceId,
	cwd,
	paneId,
	tabId,
}: ChatInterfaceProps) {
	const switchChatSession = useTabsStore((s) => s.switchChatSession);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const { models: availableModels, defaultModel } = useAvailableModels();

	// --- Shared UI state (declared once) ---
	const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
	const activeModel = selectedModel ?? defaultModel;
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");

	// --- Optimistic pending messages shown immediately on submit ---
	const [pendingMessages, setPendingMessages] = useState<PendingUserMessage[]>(
		[],
	);
	// --- Message queued while creating/switching to a new chat session ---
	const [queuedPendingMessage, setQueuedPendingMessage] =
		useState<QueuedPendingMessage | null>(null);

	// --- useChat — always called, inert when sessionId is null ---
	const chat = useChat({
		sessionId,
		proxyUrl: apiUrl,
		getHeaders: getAuthHeaders,
	});

	// --- Slash commands (always active) ---
	const { data: slashCommands = [] } =
		chatServiceTrpc.workspace.getSlashCommands.useQuery({ cwd });

	const ensureRuntimeMutation =
		chatServiceTrpc.session.ensureRuntime.useMutation();
	const ensureRuntimeMutationRef = useRef(ensureRuntimeMutation);
	ensureRuntimeMutationRef.current = ensureRuntimeMutation;
	const sendAbortControllersRef = useRef(new Map<string, AbortController>());
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const removePendingMessage = useCallback((messageId: string) => {
		setPendingMessages((prev) => {
			const next = prev.filter((message) => message.id !== messageId);
			return next.length === prev.length ? prev : next;
		});
	}, []);

	// --- Per-message metadata (sent with every message) ---
	const messageMetadata = useMemo(
		() => ({
			model: activeModel?.id,
			permissionMode,
			thinkingEnabled,
		}),
		[activeModel?.id, permissionMode, thinkingEnabled],
	);

	// --- Send queued pending message after switching into a new session ---
	const sendingQueuedMessageIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!chat.ready) return;
		if (!queuedPendingMessage) return;
		if (!sessionId) return;
		if (sendingQueuedMessageIdRef.current === queuedPendingMessage.id) return;

		let cancelled = false;
		sendingQueuedMessageIdRef.current = queuedPendingMessage.id;

		void (async () => {
			const abortController = sendAbortControllersRef.current.get(
				queuedPendingMessage.id,
			);
			try {
				if (abortController?.signal.aborted) {
					return;
				}
				const runtime = await ensureRuntimeMutationRef.current.mutateAsync({
					sessionId,
					cwd,
				});
				if (!runtime.ready) {
					throw new Error(
						runtime.reason ?? "Session runtime is not ready on this device",
					);
				}
				if (cancelled) return;
				if (abortController?.signal.aborted) {
					return;
				}
				setRuntimeError(null);
				await chat.sendMessage(
					queuedPendingMessage.text,
					queuedPendingMessage.files.length > 0
						? queuedPendingMessage.files
						: undefined,
					messageMetadata,
					{
						messageId: queuedPendingMessage.id,
						signal: abortController?.signal,
					},
				);
				if (cancelled) return;
				setQueuedPendingMessage((prev) =>
					prev?.id === queuedPendingMessage.id ? null : prev,
				);
			} catch (err) {
				if (cancelled) return;
				if (isAbortError(err)) return;
				removePendingMessage(queuedPendingMessage.id);
				setQueuedPendingMessage((prev) =>
					prev?.id === queuedPendingMessage.id ? null : prev,
				);
				setRuntimeError(
					err instanceof Error
						? err.message
						: "Failed to start session runtime",
				);
			} finally {
				if (
					!cancelled &&
					sendingQueuedMessageIdRef.current === queuedPendingMessage.id
				) {
					sendingQueuedMessageIdRef.current = null;
				}
				sendAbortControllersRef.current.delete(queuedPendingMessage.id);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		chat.ready,
		queuedPendingMessage,
		sessionId,
		cwd,
		chat.sendMessage,
		messageMetadata,
		removePendingMessage,
	]);

	useEffect(() => {
		if (chat.isLoading) return;
		if (!sessionId) return;
		if (sessionTitle) return;

		const hasAssistantMessage = chat.messages.some(
			(m) => m.role === "assistant",
		);
		if (!hasAssistantMessage) return;

		const digest = chat.messages.slice(-20).map((m) => {
			const text = m.parts
				?.filter((p): p is { type: "text"; text: string } => p.type === "text")
				.map((p) => p.text.slice(0, 500))
				.join(" ");
			return { role: m.role, text: text ?? "" };
		});

		apiTrpcClient.chat.generateTitle
			.mutate({ sessionId, messages: digest })
			.then(({ title }) => {
				setTabAutoTitle(tabId, title);
			})
			.catch(console.error);
	}, [
		chat.isLoading,
		chat.messages,
		sessionId,
		sessionTitle,
		tabId,
		setTabAutoTitle,
	]);

	// Reconcile optimistic pending messages as soon as the session DB has them.
	useEffect(() => {
		const persistedUserMessageIds = new Set(
			chat.messages
				.filter((message) => message.role === "user")
				.map((message) => message.id),
		);
		setPendingMessages((prev) => {
			const next = prev.filter(
				(message) => !persistedUserMessageIds.has(message.id),
			);
			return next.length === prev.length ? prev : next;
		});
	}, [chat.messages]);

	const displayMessages = useMemo(() => {
		const persistedIds = new Set(chat.messages.map((message) => message.id));
		const optimisticMessages = pendingMessages
			.filter((pending) => !persistedIds.has(pending.id))
			.map((pending) => ({
				id: pending.id,
				role: "user" as const,
				parts: [
					...(pending.text
						? [{ type: "text" as const, text: pending.text }]
						: []),
					...pending.files,
				],
				createdAt: pending.createdAt,
			}));
		return [...chat.messages, ...optimisticMessages];
	}, [chat.messages, pendingMessages]);

	// --- Send handler: creates session if needed, otherwise sends directly ---
	const handleSend = useCallback(
		(message: PromptInputMessage) => {
			const text = message.text.trim();
			const files = message.files ?? [];
			if (!text && files.length === 0) return;

			const messageId = crypto.randomUUID();
			const abortController = new AbortController();
			sendAbortControllersRef.current.set(messageId, abortController);
			setPendingMessages((prev) => [
				...prev,
				{ id: messageId, text, files, createdAt: new Date() },
			]);
			setRuntimeError(null);

			void (async () => {
				let handedOffToQueue = false;
				try {
					if (abortController.signal.aborted) {
						return;
					}
					if (sessionId) {
						setRuntimeError(null);
						const runtime = await ensureRuntimeMutationRef.current.mutateAsync({
							sessionId,
							cwd,
						});
						if (!runtime.ready) {
							throw new Error(
								runtime.reason ?? "Session runtime is not ready on this device",
							);
						}
						if (abortController.signal.aborted) {
							return;
						}

						let uploadedFiles: FileUIPart[] | undefined;
						if (files.length > 0) {
							uploadedFiles = await Promise.all(
								files.map((file) =>
									uploadFile(sessionId, file, abortController.signal),
								),
							);
						}
						if (abortController.signal.aborted) {
							return;
						}

						await chat.sendMessage(text, uploadedFiles, messageMetadata, {
							messageId,
							signal: abortController.signal,
						});
						return;
					}

					if (!organizationId) {
						throw new Error("Organization is required to start a chat session");
					}

					const newSessionId = crypto.randomUUID();
					await createSession(
						newSessionId,
						organizationId,
						deviceId,
						workspaceId,
						abortController.signal,
					);
					if (abortController.signal.aborted) {
						return;
					}

					let uploadedFiles: FileUIPart[] = [];
					if (files.length > 0) {
						uploadedFiles = await Promise.all(
							files.map((file) =>
								uploadFile(newSessionId, file, abortController.signal),
							),
						);
					}
					if (abortController.signal.aborted) {
						return;
					}

					handedOffToQueue = true;
					setQueuedPendingMessage({
						id: messageId,
						text,
						files: uploadedFiles,
					});
					switchChatSession(paneId, newSessionId);
				} catch (err) {
					if (isAbortError(err)) return;
					removePendingMessage(messageId);
					setRuntimeError(
						err instanceof Error ? err.message : "Failed to send message",
					);
				} finally {
					if (
						!handedOffToQueue &&
						sendAbortControllersRef.current.get(messageId) === abortController
					) {
						sendAbortControllersRef.current.delete(messageId);
					}
				}
			})();
		},
		[
			sessionId,
			organizationId,
			deviceId,
			workspaceId,
			paneId,
			switchChatSession,
			cwd,
			chat.sendMessage,
			messageMetadata,
			removePendingMessage,
		],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			for (const controller of sendAbortControllersRef.current.values()) {
				controller.abort();
			}
			sendAbortControllersRef.current.clear();
			sendingQueuedMessageIdRef.current = null;
			setQueuedPendingMessage(null);
			setPendingMessages([]);
			setRuntimeError(null);
			chat.stop();
		},
		[chat.stop],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			handleSend({ text: `/${command.name}`, files: [] });
		},
		[handleSend],
	);

	const isStreaming = chat.isLoading;
	const canAbort = isStreaming || pendingMessages.length > 0;
	const submitStatus: ChatStatus | undefined = canAbort
		? "streaming"
		: undefined;

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<MessageList
					messages={displayMessages}
					isStreaming={isStreaming}
					workspaceId={workspaceId}
				/>
				<ChatInputFooter
					cwd={cwd}
					error={runtimeError ?? chat.error}
					canAbort={canAbort}
					submitStatus={submitStatus}
					availableModels={availableModels}
					selectedModel={activeModel}
					setSelectedModel={setSelectedModel}
					modelSelectorOpen={modelSelectorOpen}
					setModelSelectorOpen={setModelSelectorOpen}
					permissionMode={permissionMode}
					setPermissionMode={setPermissionMode}
					thinkingEnabled={thinkingEnabled}
					setThinkingEnabled={setThinkingEnabled}
					slashCommands={slashCommands}
					onSend={handleSend}
					onStop={handleStop}
					onSlashCommandSend={handleSlashCommandSend}
				/>
			</div>
		</PromptInputProvider>
	);
}
