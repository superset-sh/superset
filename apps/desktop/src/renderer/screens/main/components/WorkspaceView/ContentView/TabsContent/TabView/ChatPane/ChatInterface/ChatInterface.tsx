import { chatServiceTrpc, useChat } from "@superset/chat/client";
import {
	type PromptInputMessage,
	PromptInputProvider,
} from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getAuthToken } from "renderer/lib/auth-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { McpOverviewPicker } from "./components/McpOverviewPicker";
import { MessageList } from "./components/MessageList";
import { useChatSendController } from "./hooks/useChatSendController";
import { useSlashCommandExecutor } from "./hooks/useSlashCommandExecutor";
import type { SlashCommand } from "./hooks/useSlashCommands";
import type {
	ChatInterfaceProps,
	InterruptedMessage,
	McpOverviewPayload,
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
	organizationId,
	deviceId,
	workspaceId,
	cwd,
	paneId,
}: ChatInterfaceProps) {
	const switchChatSession = useTabsStore((state) => state.switchChatSession);
	const { models: availableModels, defaultModel } = useAvailableModels();

	const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
	const activeModel = selectedModel ?? defaultModel;
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [interruptedMessage, setInterruptedMessage] =
		useState<InterruptedMessage | null>(null);
	const [mcpOverview, setMcpOverview] = useState<McpOverviewPayload | null>(
		null,
	);
	const [mcpOverviewOpen, setMcpOverviewOpen] = useState(false);

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

	const startFreshSessionAndResetUi = useCallback(async () => {
		const result = await startFreshSession();
		if (result.created) {
			setMcpOverview(null);
			setMcpOverviewOpen(false);
		}
		return result;
	}, [startFreshSession]);

	const { resolveSlashCommandInput } = useSlashCommandExecutor({
		cwd,
		availableModels,
		canAbort,
		onStartFreshSession: startFreshSessionAndResetUi,
		onStopActiveResponse: stopActiveResponse,
		onSelectModel: setSelectedModel,
		onOpenModelPicker: () => setModelSelectorOpen(true),
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onShowMcpOverview: (overview: McpOverviewPayload) => {
			setMcpOverview(overview);
			setMcpOverviewOpen(true);
		},
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
		setMcpOverview(null);
		setMcpOverviewOpen(false);
	}, []);

	const handleStop = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			clearRuntimeError();
			stopActiveResponse();
		},
		[clearRuntimeError, stopActiveResponse],
	);

	const handleAnswer = useCallback(
		async (toolCallId: string, answers: Record<string, string>) => {
			clearRuntimeError();
			await chat.addToolOutput({
				tool: "ask_user_question",
				toolCallId,
				output: { answers },
			});
		},
		[clearRuntimeError, chat.addToolOutput],
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
					onAnswer={handleAnswer}
				/>
				<McpOverviewPicker
					overview={mcpOverview}
					open={mcpOverviewOpen}
					onOpenChange={setMcpOverviewOpen}
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
