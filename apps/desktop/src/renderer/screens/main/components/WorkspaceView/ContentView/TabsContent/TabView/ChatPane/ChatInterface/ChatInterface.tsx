import { chatServiceTrpc, useChat } from "@superset/chat/client";
import type { PromptInputMessage } from "@superset/ui/ai-elements/prompt-input";
import { PromptInputProvider } from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type { FileUIPart } from "ai";
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
			...(workspaceId ? { workspaceId } : {}),
		}),
	});
}

async function uploadFile(
	sessionId: string,
	file: FileUIPart,
): Promise<FileUIPart> {
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

	// --- Pending message bridge (no-session → session) ---
	const [pendingMessage, setPendingMessage] = useState<string | null>(null);
	const [pendingFiles, setPendingFiles] = useState<FileUIPart[]>([]);

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
	const [runtimeError, setRuntimeError] = useState<string | null>(null);

	// --- Per-message metadata (sent with every message) ---
	const messageMetadata = useMemo(
		() => ({
			model: activeModel?.id,
			permissionMode,
			thinkingEnabled,
		}),
		[activeModel?.id, permissionMode, thinkingEnabled],
	);

	// --- Send pending message once the session is ready ---
	const sentPendingRef = useRef(false);
	useEffect(() => {
		if (!chat.ready || sentPendingRef.current) return;
		if (!pendingMessage && pendingFiles.length === 0) return;
		if (!sessionId) return;

		let cancelled = false;
		sentPendingRef.current = true;

		void (async () => {
			try {
				const runtime = await ensureRuntimeMutation.mutateAsync({
					sessionId,
					cwd,
				});
				if (!runtime.ready) {
					throw new Error(runtime.reason ?? "Session runtime is not ready");
				}
				if (cancelled) return;
				setRuntimeError(null);
				await chat.sendMessage(
					pendingMessage ?? "",
					pendingFiles.length > 0 ? pendingFiles : undefined,
					messageMetadata,
				);
				if (cancelled) return;
				setPendingMessage(null);
				setPendingFiles([]);
			} catch (err) {
				if (cancelled) return;
				sentPendingRef.current = false;
				setRuntimeError(
					err instanceof Error
						? err.message
						: "Failed to start session runtime",
				);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		chat.ready,
		chat.sendMessage,
		pendingMessage,
		pendingFiles,
		messageMetadata,
		sessionId,
		ensureRuntimeMutation,
		cwd,
	]);

	// Reset ref when sessionId changes so pending message is re-sent for new sessions
	// biome-ignore lint/correctness/useExhaustiveDependencies: sessionId triggers the reset intentionally
	useEffect(() => {
		sentPendingRef.current = false;
	}, [sessionId]);

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

	// --- Display messages: show synthetic pending while useChat preloads ---
	const displayMessages =
		chat.messages.length === 0 && (pendingMessage || pendingFiles.length > 0)
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
			: chat.messages;

	// --- Send handler: creates session if needed, otherwise sends directly ---
	const handleSend = useCallback(
		async (message: PromptInputMessage) => {
			const text = message.text.trim();
			const files = message.files ?? [];
			if (!text && files.length === 0) return;

			if (sessionId) {
				setRuntimeError(null);
				const runtime = await ensureRuntimeMutation.mutateAsync({
					sessionId,
					cwd,
				});
				if (!runtime.ready) {
					setRuntimeError(
						runtime.reason ?? "Session runtime is not ready on this device",
					);
					return;
				}

				// Active session — send directly
				let uploadedFiles: FileUIPart[] | undefined;
				if (files.length > 0) {
					const results = await Promise.all(
						files.map((f) => uploadFile(sessionId, f)),
					);
					uploadedFiles = results;
				}

				await chat.sendMessage(text, uploadedFiles, messageMetadata);
			} else {
				// No session — create one, then switch (re-renders with sessionId)
				if (!organizationId) return;

				const newSessionId = crypto.randomUUID();
				try {
					await createSession(
						newSessionId,
						organizationId,
						deviceId,
						workspaceId,
					);

					// Upload files immediately
					let uploadedFiles: FileUIPart[] = [];
					if (files.length > 0) {
						uploadedFiles = await Promise.all(
							files.map((f) => uploadFile(newSessionId, f)),
						);
					}

					setPendingMessage(text);
					setPendingFiles(uploadedFiles);
					switchChatSession(paneId, newSessionId);
				} catch {
					// Session creation failed — don't navigate
				}
			}
		},
		[
			sessionId,
			organizationId,
			deviceId,
			workspaceId,
			paneId,
			switchChatSession,
			ensureRuntimeMutation,
			cwd,
			chat.sendMessage,
			messageMetadata,
		],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
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

	const isStreaming = chat.isLoading || !!pendingMessage;

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
					isStreaming={isStreaming}
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
