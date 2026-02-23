import { chatServiceTrpc, useChat } from "@superset/chat/client";
import { PromptInputProvider } from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getAuthToken } from "renderer/lib/auth-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { MessageList } from "./components/MessageList";
import { useChatSendController } from "./hooks/useChatSendController";
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

interface TitleMessagePartLike {
	type: string;
	text?: string;
}

interface TitleMessageLike {
	role: string;
	parts?: TitleMessagePartLike[];
}

interface TitleDigestMessage {
	role: string;
	text: string;
}

function hasAssistantMessage(messages: TitleMessageLike[]): boolean {
	return messages.some((message) => message.role === "assistant");
}

function buildTitleDigest(messages: TitleMessageLike[]): TitleDigestMessage[] {
	return messages.slice(-20).map((message) => {
		const text = (message.parts ?? [])
			.filter((part) => part.type === "text")
			.map((part) => part.text?.slice(0, 500) ?? "")
			.join(" ");
		return { role: message.role, text };
	});
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
	const switchChatSession = useTabsStore((state) => state.switchChatSession);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const { models: availableModels, defaultModel } = useAvailableModels();

	const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
	const activeModel = selectedModel ?? defaultModel;
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const titleRequestedRef = useRef(false);
	const titleRequestSessionRef = useRef<string | null>(null);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");

	const chat = useChat({
		sessionId,
		proxyUrl: apiUrl,
		getHeaders: getAuthHeaders,
	});

	const { data: slashCommands = [] } =
		chatServiceTrpc.workspace.getSlashCommands.useQuery({ cwd });

	const messageMetadata = useMemo(
		() => ({
			model: activeModel?.id,
			permissionMode,
			thinkingEnabled,
		}),
		[activeModel?.id, permissionMode, thinkingEnabled],
	);

	const {
		pendingMessages,
		runtimeError,
		handleSend,
		stopPendingSends,
		markSubmitStarted,
		markSubmitEnded,
		canAbort,
		submitStatus,
	} = useChatSendController({
		chat,
		sessionId,
		organizationId,
		deviceId,
		workspaceId,
		paneId,
		cwd,
		messageMetadata,
		switchChatSession,
	});

	useEffect(() => {
		if (chat.isLoading) return;
		if (!sessionId || sessionTitle) return;
		if (titleRequestSessionRef.current !== sessionId) {
			titleRequestSessionRef.current = sessionId;
			titleRequestedRef.current = false;
		}
		if (titleRequestedRef.current) return;
		if (!hasAssistantMessage(chat.messages)) return;
		titleRequestedRef.current = true;

		const requestedSessionId = sessionId;
		const digest = buildTitleDigest(chat.messages);

		apiTrpcClient.chat.generateTitle
			.mutate({ sessionId: requestedSessionId, messages: digest })
			.then(({ title }) => {
				if (titleRequestSessionRef.current !== requestedSessionId) return;
				setTabAutoTitle(tabId, title);
			})
			.catch((error) => {
				if (titleRequestSessionRef.current === requestedSessionId) {
					titleRequestedRef.current = false;
				}
				console.error(error);
			});
	}, [
		chat.isLoading,
		chat.messages,
		sessionId,
		sessionTitle,
		tabId,
		setTabAutoTitle,
	]);

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

	const handleStop = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			stopPendingSends();
			chat.stop();
		},
		[stopPendingSends, chat.stop],
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
					isStreaming={chat.isLoading}
					submitStatus={submitStatus}
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
					onSubmitStart={markSubmitStarted}
					onSubmitEnd={markSubmitEnded}
					onStop={handleStop}
					onSlashCommandSend={handleSlashCommandSend}
				/>
			</div>
		</PromptInputProvider>
	);
}
