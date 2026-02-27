import { chatServiceTrpc } from "@superset/chat/client";
import {
	chatMastraServiceTrpc,
	useMastraChatDisplay,
} from "@superset/chat-mastra/client";
import {
	type PromptInputMessage,
	PromptInputProvider,
} from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { ChatInputFooter } from "../../ChatPane/ChatInterface/components/ChatInputFooter";
import { useSlashCommandExecutor } from "../../ChatPane/ChatInterface/hooks/useSlashCommandExecutor";
import type { SlashCommand } from "../../ChatPane/ChatInterface/hooks/useSlashCommands";
import type {
	ModelOption,
	PermissionMode,
} from "../../ChatPane/ChatInterface/types";
import { ChatMastraMessageList } from "./components/ChatMastraMessageList";
import { McpControls } from "./components/McpControls";
import { useMcpUi } from "./hooks/useMcpUi";
import type { ChatMastraInterfaceProps } from "./types";
import { toMastraImages } from "./utils/toMastraImages";

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

function toErrorMessage(error: unknown): string | null {
	if (!error) return null;
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.message;
	return "Unknown chat error";
}

export function ChatMastraInterface({
	sessionId,
	workspaceId,
	cwd,
	onStartFreshSession,
	onRawSnapshotChange,
}: ChatMastraInterfaceProps) {
	const { models: availableModels, defaultModel } = useAvailableModels();
	const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
	const activeModel = selectedModel ?? defaultModel;
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>(
		undefined,
	);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const currentSessionRef = useRef<string | null>(null);
	const chatMastraServiceTrpcUtils = chatMastraServiceTrpc.useUtils();

	const { data: slashCommands = [] } =
		chatServiceTrpc.workspace.getSlashCommands.useQuery(
			{ cwd },
			{ enabled: Boolean(cwd) },
		);

	const chat = useMastraChatDisplay({
		sessionId,
		cwd,
		enabled: Boolean(sessionId),
	});
	const {
		commands,
		messages,
		currentMessage,
		isRunning = false,
		error = null,
		activeTools,
		toolInputBuffers,
	} = chat;

	const clearRuntimeError = useCallback(() => {
		setRuntimeError(null);
	}, []);

	const setRuntimeErrorMessage = useCallback((message: string) => {
		setRuntimeError(message);
	}, []);

	const canAbort = Boolean(isRunning);
	const loadMcpOverview = useCallback(
		async (rootCwd: string) => {
			if (!sessionId) {
				return { sourcePath: null, servers: [] };
			}

			return chatMastraServiceTrpcUtils.workspace.getMcpOverview.fetch({
				sessionId,
				cwd: rootCwd,
			});
		},
		[chatMastraServiceTrpcUtils.workspace.getMcpOverview, sessionId],
	);
	const mcpUi = useMcpUi({
		cwd,
		loadOverview: loadMcpOverview,
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
	});
	const resetMcpUi = mcpUi.resetUi;
	const refreshMcpOverview = mcpUi.refreshOverview;

	const { resolveSlashCommandInput } = useSlashCommandExecutor({
		cwd,
		availableModels,
		canAbort,
		onStartFreshSession,
		onStopActiveResponse: () => {
			void commands.stop();
		},
		onSelectModel: setSelectedModel,
		onOpenModelPicker: () => setModelSelectorOpen(true),
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onShowMcpOverview: mcpUi.showOverview,
		loadMcpOverview,
	});

	useEffect(() => {
		if (currentSessionRef.current === sessionId) return;
		currentSessionRef.current = sessionId;
		setSubmitStatus(undefined);
		setRuntimeError(null);
		resetMcpUi();
		if (sessionId) {
			void refreshMcpOverview();
		}
	}, [refreshMcpOverview, resetMcpUi, sessionId]);

	useEffect(() => {
		if (isRunning) {
			setSubmitStatus((previousStatus) =>
				previousStatus === "submitted" || previousStatus === "streaming"
					? "streaming"
					: previousStatus,
			);
			return;
		}
		setSubmitStatus(undefined);
	}, [isRunning]);

	useEffect(() => {
		onRawSnapshotChange?.({
			sessionId,
			isRunning: canAbort,
			currentMessage: currentMessage ?? null,
			messages: messages ?? [],
			error,
		});
	}, [
		canAbort,
		currentMessage,
		error,
		messages,
		onRawSnapshotChange,
		sessionId,
	]);

	const handleSend = useCallback(
		async (message: PromptInputMessage) => {
			let text = message.text.trim();
			const files = (message.files ?? []).map((file) => ({
				url: file.url,
				mediaType: file.mediaType,
				filename: file.filename,
			}));

			const slashCommandResult = await resolveSlashCommandInput(text);
			if (slashCommandResult.handled) {
				return;
			}
			text = slashCommandResult.nextText.trim();

			const images = toMastraImages(files);
			if (!text && images.length === 0) return;
			setSubmitStatus("submitted");
			clearRuntimeError();

			await commands.sendMessage({
				payload: {
					content: text || "",
					...(images.length > 0 ? { images } : {}),
				},
				metadata: {
					model: activeModel?.id,
				},
			});
		},
		[activeModel?.id, clearRuntimeError, commands, resolveSlashCommandInput],
	);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			clearRuntimeError();
			await commands.stop();
		},
		[clearRuntimeError, commands],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			void handleSend({ text: `/${command.name}`, files: [] });
		},
		[handleSend],
	);

	const errorMessage = runtimeError ?? toErrorMessage(error);
	const mergedMessages = useMemo(() => messages, [messages]);

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<ChatMastraMessageList
					messages={mergedMessages}
					isRunning={canAbort}
					currentMessage={currentMessage ?? null}
					workspaceId={workspaceId}
					workspaceCwd={cwd}
					activeTools={activeTools}
					toolInputBuffers={toolInputBuffers}
				/>
				<McpControls mcpUi={mcpUi} />
				<ChatInputFooter
					cwd={cwd}
					error={errorMessage}
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
					onSend={(message) => {
						void handleSend(message);
					}}
					onSubmitStart={() => setSubmitStatus("submitted")}
					onSubmitEnd={() => {
						if (!canAbort) setSubmitStatus(undefined);
					}}
					onStop={handleStop}
					onSlashCommandSend={handleSlashCommandSend}
				/>
			</div>
		</PromptInputProvider>
	);
}
