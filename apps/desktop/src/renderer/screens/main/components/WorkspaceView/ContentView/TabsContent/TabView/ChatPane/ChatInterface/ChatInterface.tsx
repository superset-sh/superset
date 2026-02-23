import { chatServiceTrpc, useChat } from "@superset/chat/client";
import {
	type PromptInputMessage,
	PromptInputProvider,
} from "@superset/ui/ai-elements/prompt-input";
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
import { useSlashCommandExecutor } from "./hooks/useSlashCommandExecutor";
import type { SlashCommand } from "./hooks/useSlashCommands";
import type {
	ChatInterfaceProps,
	InterruptedMessage,
	ModelOption,
	PermissionMode,
} from "./types";

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

function cloneParts(
	parts: InterruptedMessage["parts"],
): InterruptedMessage["parts"] {
	if (typeof structuredClone === "function") {
		return structuredClone(parts);
	}
	return parts.map((part) => ({ ...part }));
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
	const [interruptedMessage, setInterruptedMessage] =
		useState<InterruptedMessage | null>(null);

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
		handleSend: sendThroughController,
		startFreshSession,
		setRuntimeErrorMessage,
		clearRuntimeError,
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

	const captureInterruptedMessage = useCallback(() => {
		if (!chat.isLoading) return;
		const lastMessage = chat.messages.at(-1);
		if (!lastMessage || lastMessage.role !== "assistant") return;
		if (lastMessage.parts.length === 0) return;
		setInterruptedMessage({
			id: `interrupted:${lastMessage.id}`,
			sourceMessageId: lastMessage.id,
			parts: cloneParts(lastMessage.parts),
		});
	}, [chat.isLoading, chat.messages]);

	const stopActiveResponse = useCallback(() => {
		captureInterruptedMessage();
		stopPendingSends();
		chat.stop();
	}, [captureInterruptedMessage, stopPendingSends, chat.stop]);

	const { resolveSlashCommandInput } = useSlashCommandExecutor({
		cwd,
		availableModels,
		canAbort,
		onStartFreshSession: startFreshSession,
		onStopActiveResponse: stopActiveResponse,
		onSelectModel: setSelectedModel,
		onOpenModelPicker: () => setModelSelectorOpen(true),
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
	});

	const handleSend = useCallback(
		async (message: PromptInputMessage) => {
			let text = message.text.trim();
			const files = message.files ?? [];

			const slashCommandResult = await resolveSlashCommandInput(text);
			if (slashCommandResult.handled) {
				return;
			}
			text = slashCommandResult.nextText.trim();

			if (!text && files.length === 0) return;

			setInterruptedMessage(null);
			clearRuntimeError();
			sendThroughController({ text, files });
		},
		[clearRuntimeError, resolveSlashCommandInput, sendThroughController],
	);

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
		const merged = [...chat.messages, ...optimisticMessages];
		if (!interruptedMessage) return merged;
		return merged.filter(
			(message) => message.id !== interruptedMessage.sourceMessageId,
		);
	}, [chat.messages, pendingMessages, interruptedMessage]);

	const interruptedPreview = interruptedMessage
		? { id: interruptedMessage.id, parts: interruptedMessage.parts }
		: null;

	useEffect(() => {
		setInterruptedMessage(null);
	}, []);

	const handleStop = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			clearRuntimeError();
			stopActiveResponse();
		},
		[clearRuntimeError, stopActiveResponse],
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
					interruptedMessage={interruptedPreview}
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
