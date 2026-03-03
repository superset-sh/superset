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
import { useCallback, useEffect, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { posthog } from "renderer/lib/posthog";
import { useChatPreferencesStore } from "renderer/stores/chat-preferences";
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
import {
	type ChatSendMessageInput,
	sendMessageForSession,
	toSendFailureMessage,
} from "./utils/sendMessage";
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

const AUTO_LAUNCH_MAX_RETRIES = 3;
const AUTO_LAUNCH_RETRY_DELAY_MS = 1500;

function getLaunchConfigKey(
	config: NonNullable<ChatMastraInterfaceProps["initialLaunchConfig"]>,
): string {
	return JSON.stringify({
		initialPrompt: config.initialPrompt ?? null,
		model: config.metadata?.model ?? null,
		retryCount: config.retryCount ?? null,
	});
}

export function ChatMastraInterface({
	sessionId,
	initialLaunchConfig,
	workspaceId,
	organizationId,
	cwd,
	isSessionReady,
	ensureSessionReady,
	onStartFreshSession,
	onConsumeLaunchConfig,
	onRawSnapshotChange,
}: ChatMastraInterfaceProps) {
	const { models: availableModels, defaultModel } = useAvailableModels();
	const selectedModelId = useChatPreferencesStore(
		(state) => state.selectedModelId,
	);
	const setSelectedModelId = useChatPreferencesStore(
		(state) => state.setSelectedModelId,
	);
	const selectedModel =
		availableModels.find((model) => model.id === selectedModelId) ?? null;
	const activeModel = selectedModel ?? defaultModel;
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>(
		undefined,
	);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [approvalResponsePending, setApprovalResponsePending] = useState(false);
	const [planResponsePending, setPlanResponsePending] = useState(false);
	const [questionResponsePending, setQuestionResponsePending] = useState(false);
	const currentMcpScopeRef = useRef<string | null>(null);
	const consumedLaunchConfigRef = useRef<string | null>(null);
	const autoLaunchInFlightRef = useRef<string | null>(null);
	const autoLaunchAttemptsRef = useRef<Record<string, number>>({});
	const autoLaunchSessionLockRef = useRef<Record<string, string | null>>({});
	const messagesLengthRef = useRef(0);
	const autoLaunchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const chatMastraServiceTrpcUtils = chatMastraServiceTrpc.useUtils();
	const authenticateMcpServerMutation =
		chatMastraServiceTrpc.workspace.authenticateMcpServer.useMutation();

	const { data: slashCommands = [] } =
		chatServiceTrpc.workspace.getSlashCommands.useQuery(
			{ cwd },
			{ enabled: Boolean(cwd) },
		);

	const chat = useMastraChatDisplay({
		sessionId,
		cwd,
		enabled: Boolean(sessionId),
		fps: 60,
	});
	const {
		commands,
		messages,
		currentMessage,
		isRunning = false,
		error = null,
		activeTools,
		toolInputBuffers,
		activeSubagents,
		pendingApproval = null,
		pendingPlanApproval = null,
		pendingQuestion = null,
	} = chat;

	const clearRuntimeError = useCallback(() => {
		setRuntimeError(null);
	}, []);

	const setRuntimeErrorMessage = useCallback((message: string) => {
		setRuntimeError(message);
	}, []);

	const handleSelectModel = useCallback(
		(model: React.SetStateAction<ModelOption | null>) => {
			const nextSelectedModel =
				typeof model === "function" ? model(selectedModel) : model;
			if (!nextSelectedModel) {
				setSelectedModelId(null);
				return;
			}
			posthog.capture("chat_model_changed", {
				workspace_id: workspaceId,
				session_id: sessionId,
				organization_id: organizationId,
				model_id: nextSelectedModel.id,
				model_name: nextSelectedModel.name,
				trigger: "picker",
			});
			setSelectedModelId(nextSelectedModel.id);
		},
		[organizationId, selectedModel, sessionId, setSelectedModelId, workspaceId],
	);

	const sendMessageToSession = useCallback(
		async (targetSessionId: string, input: ChatSendMessageInput) => {
			await chatMastraServiceTrpcUtils.client.session.sendMessage.mutate({
				sessionId: targetSessionId,
				...(cwd ? { cwd } : {}),
				...input,
			});
		},
		[chatMastraServiceTrpcUtils, cwd],
	);

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
	const authenticateMcpServer = useCallback(
		async (rootCwd: string, serverName: string) => {
			if (!sessionId) {
				return { sourcePath: null, servers: [] };
			}

			return authenticateMcpServerMutation.mutateAsync({
				sessionId,
				cwd: rootCwd,
				serverName,
			});
		},
		[authenticateMcpServerMutation, sessionId],
	);
	const mcpUi = useMcpUi({
		cwd,
		loadOverview: loadMcpOverview,
		authenticateServer: authenticateMcpServer,
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onTrackEvent: (event, properties) => {
			posthog.capture(event, {
				workspace_id: workspaceId,
				session_id: sessionId,
				organization_id: organizationId,
				...properties,
			});
		},
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
		onSelectModel: handleSelectModel,
		onOpenModelPicker: () => setModelSelectorOpen(true),
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onShowMcpOverview: mcpUi.showOverview,
		loadMcpOverview,
		onTrackEvent: (event, properties) => {
			posthog.capture(event, {
				workspace_id: workspaceId,
				session_id: sessionId,
				organization_id: organizationId,
				...properties,
			});
		},
	});

	useEffect(() => {
		const scopeKey = `${sessionId ?? "no-session"}::${cwd || "no-cwd"}`;
		if (currentMcpScopeRef.current === scopeKey) return;
		currentMcpScopeRef.current = scopeKey;
		setSubmitStatus(undefined);
		setRuntimeError(null);
		resetMcpUi();
		if (sessionId) {
			void refreshMcpOverview();
		}
	}, [cwd, refreshMcpOverview, resetMcpUi, sessionId]);

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

	useEffect(() => {
		messagesLengthRef.current = messages?.length ?? 0;
	}, [messages]);

	const handleSend = useCallback(
		async (message: PromptInputMessage) => {
			let text = message.text.trim();
			const files = (message.files ?? []).map((file) => ({
				url: file.url,
				mediaType: file.mediaType,
				filename: file.filename,
			}));

			const isSlashCommand = text.startsWith("/");
			const slashCommandResult = await resolveSlashCommandInput(text);
			if (slashCommandResult.handled) {
				setSubmitStatus(undefined);
				return;
			}
			text = slashCommandResult.nextText.trim();

			const images = toMastraImages(files);
			if (!text && images.length === 0) {
				setSubmitStatus(undefined);
				return;
			}
			setSubmitStatus("submitted");
			clearRuntimeError();

			const sendInput: ChatSendMessageInput = {
				payload: {
					content: text || "",
					...(images.length > 0 ? { images } : {}),
				},
				metadata: {
					model: activeModel?.id,
				},
			};

			let targetSessionId = sessionId;
			try {
				const sendResult = await sendMessageForSession({
					currentSessionId: sessionId,
					isSessionReady,
					ensureSessionReady,
					onStartFreshSession,
					sendToCurrentSession: () => commands.sendMessage(sendInput),
					sendToSession: (nextSessionId) =>
						sendMessageToSession(nextSessionId, sendInput),
				});
				targetSessionId = sendResult.targetSessionId;
			} catch (error) {
				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				if (error instanceof Error) throw error;
				throw new Error(sendErrorMessage);
			}

			posthog.capture("chat_message_sent", {
				workspace_id: workspaceId,
				session_id: targetSessionId,
				organization_id: organizationId,
				model_id: activeModel?.id ?? null,
				mention_count: 0,
				attachment_count: files.length,
				is_slash_command: isSlashCommand,
				message_length: text.length,
				turn_number: (messages?.length ?? 0) + 1,
			});
		},
		[
			activeModel?.id,
			clearRuntimeError,
			commands,
			messages?.length,
			isSessionReady,
			onStartFreshSession,
			organizationId,
			resolveSlashCommandInput,
			ensureSessionReady,
			sendMessageToSession,
			sessionId,
			setRuntimeErrorMessage,
			workspaceId,
		],
	);

	useEffect(() => {
		if (!initialLaunchConfig) return;

		const launchConfigKey = getLaunchConfigKey(initialLaunchConfig);
		const attemptAutoLaunch = async (): Promise<void> => {
			if (consumedLaunchConfigRef.current === launchConfigKey) return;
			if (autoLaunchInFlightRef.current === launchConfigKey) return;

			const prompt = initialLaunchConfig.initialPrompt?.trim();
			if (!prompt) {
				consumedLaunchConfigRef.current = launchConfigKey;
				delete autoLaunchAttemptsRef.current[launchConfigKey];
				delete autoLaunchSessionLockRef.current[launchConfigKey];
				onConsumeLaunchConfig();
				return;
			}

			const currentSessionKey = sessionId ?? null;
			const lockedSession = autoLaunchSessionLockRef.current[launchConfigKey];
			if (lockedSession === undefined) {
				autoLaunchSessionLockRef.current[launchConfigKey] = currentSessionKey;
			} else if (lockedSession !== currentSessionKey) {
				// Don't send launch retries into a different user-selected session.
				return;
			}

			const previousAttempts =
				autoLaunchAttemptsRef.current[launchConfigKey] ?? 0;
			const retryLimit =
				initialLaunchConfig.retryCount ?? AUTO_LAUNCH_MAX_RETRIES;
			if (previousAttempts >= retryLimit) return;

			autoLaunchAttemptsRef.current[launchConfigKey] = previousAttempts + 1;
			autoLaunchInFlightRef.current = launchConfigKey;
			if (autoLaunchRetryTimerRef.current) {
				clearTimeout(autoLaunchRetryTimerRef.current);
				autoLaunchRetryTimerRef.current = null;
			}

			clearRuntimeError();
			setSubmitStatus("submitted");

			const modelId = initialLaunchConfig.metadata?.model ?? activeModel?.id;
			const sendInput: ChatSendMessageInput = {
				payload: {
					content: prompt,
				},
				metadata: {
					model: modelId,
				},
			};

			try {
				const sendResult = await sendMessageForSession({
					currentSessionId: autoLaunchSessionLockRef.current[launchConfigKey],
					isSessionReady,
					ensureSessionReady,
					onStartFreshSession,
					sendToCurrentSession: () => commands.sendMessage(sendInput),
					sendToSession: (nextSessionId) =>
						sendMessageToSession(nextSessionId, sendInput),
				});

				autoLaunchInFlightRef.current = null;
				consumedLaunchConfigRef.current = launchConfigKey;
				delete autoLaunchAttemptsRef.current[launchConfigKey];
				delete autoLaunchSessionLockRef.current[launchConfigKey];
				onConsumeLaunchConfig();

				posthog.capture("chat_message_sent", {
					workspace_id: workspaceId,
					session_id: sendResult.targetSessionId,
					organization_id: organizationId,
					model_id: modelId ?? null,
					mention_count: 0,
					attachment_count: 0,
					is_slash_command: false,
					message_length: prompt.length,
					turn_number: messagesLengthRef.current + 1,
					send_trigger: "launch-config",
				});
			} catch (error) {
				autoLaunchInFlightRef.current = null;

				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				console.debug("[chat-mastra] auto launch send failed", error);

				const currentAttempts =
					autoLaunchAttemptsRef.current[launchConfigKey] ??
					previousAttempts + 1;
				if (currentAttempts < retryLimit) {
					autoLaunchRetryTimerRef.current = setTimeout(() => {
						void attemptAutoLaunch();
					}, AUTO_LAUNCH_RETRY_DELAY_MS);
				}
			}
		};
		void attemptAutoLaunch();

		return () => {
			if (autoLaunchRetryTimerRef.current) {
				clearTimeout(autoLaunchRetryTimerRef.current);
				autoLaunchRetryTimerRef.current = null;
			}
		};
	}, [
		activeModel?.id,
		clearRuntimeError,
		commands,
		ensureSessionReady,
		initialLaunchConfig,
		isSessionReady,
		onConsumeLaunchConfig,
		onStartFreshSession,
		organizationId,
		sendMessageToSession,
		sessionId,
		setRuntimeErrorMessage,
		workspaceId,
	]);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			clearRuntimeError();
			await commands.stop();
			posthog.capture("chat_turn_aborted", {
				workspace_id: workspaceId,
				session_id: sessionId,
				organization_id: organizationId,
				model_id: activeModel?.id ?? null,
			});
		},
		[
			activeModel?.id,
			clearRuntimeError,
			commands,
			organizationId,
			sessionId,
			workspaceId,
		],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			void handleSend({ text: `/${command.name}`, files: [] }).catch(
				(error) => {
					console.debug("[chat-mastra] handleSlashCommandSend error", error);
				},
			);
		},
		[handleSend],
	);
	const handleApprovalResponse = useCallback(
		async (decision: "approve" | "decline" | "always_allow_category") => {
			if (!pendingApproval?.toolCallId) return;
			clearRuntimeError();
			setApprovalResponsePending(true);
			try {
				await commands.respondToApproval({
					payload: { decision },
				});
			} finally {
				setApprovalResponsePending(false);
			}
		},
		[clearRuntimeError, commands, pendingApproval?.toolCallId],
	);
	const handlePlanResponse = useCallback(
		async (response: {
			action: "approved" | "rejected";
			feedback?: string;
		}) => {
			if (!pendingPlanApproval?.planId) return;
			clearRuntimeError();
			setPlanResponsePending(true);
			try {
				const feedback = response.feedback?.trim();
				await commands.respondToPlan({
					payload: {
						planId: pendingPlanApproval.planId,
						response: {
							action: response.action,
							...(feedback ? { feedback } : {}),
						},
					},
				});
			} finally {
				setPlanResponsePending(false);
			}
		},
		[clearRuntimeError, commands, pendingPlanApproval?.planId],
	);
	const handleQuestionResponse = useCallback(
		async (questionId: string, answer: string) => {
			const trimmedQuestionId = questionId.trim();
			const trimmedAnswer = answer.trim();
			if (!trimmedQuestionId || !trimmedAnswer) return;
			clearRuntimeError();
			setQuestionResponsePending(true);
			try {
				await commands.respondToQuestion({
					payload: {
						questionId: trimmedQuestionId,
						answer: trimmedAnswer,
					},
				});
			} finally {
				setQuestionResponsePending(false);
			}
		},
		[clearRuntimeError, commands],
	);

	const errorMessage = runtimeError ?? toErrorMessage(error);
	const isAwaitingAssistant =
		isRunning || submitStatus === "submitted" || submitStatus === "streaming";

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<ChatMastraMessageList
					messages={messages}
					isRunning={canAbort}
					isAwaitingAssistant={isAwaitingAssistant}
					currentMessage={currentMessage ?? null}
					workspaceId={workspaceId}
					sessionId={sessionId}
					organizationId={organizationId}
					workspaceCwd={cwd}
					activeTools={activeTools}
					toolInputBuffers={toolInputBuffers}
					activeSubagents={activeSubagents}
					pendingApproval={pendingApproval}
					isApprovalSubmitting={approvalResponsePending}
					onApprovalRespond={handleApprovalResponse}
					pendingPlanApproval={pendingPlanApproval}
					isPlanSubmitting={planResponsePending}
					onPlanRespond={handlePlanResponse}
					pendingQuestion={pendingQuestion}
					isQuestionSubmitting={questionResponsePending}
					onQuestionRespond={handleQuestionResponse}
				/>
				<McpControls mcpUi={mcpUi} />
				<ChatInputFooter
					cwd={cwd}
					error={errorMessage}
					canAbort={canAbort}
					submitStatus={submitStatus}
					availableModels={availableModels}
					selectedModel={activeModel}
					setSelectedModel={handleSelectModel}
					modelSelectorOpen={modelSelectorOpen}
					setModelSelectorOpen={setModelSelectorOpen}
					permissionMode={permissionMode}
					setPermissionMode={setPermissionMode}
					thinkingEnabled={thinkingEnabled}
					setThinkingEnabled={setThinkingEnabled}
					slashCommands={slashCommands}
					onSend={handleSend}
					onSubmitStart={() => setSubmitStatus("submitted")}
					onStop={handleStop}
					onSlashCommandSend={handleSlashCommandSend}
				/>
			</div>
		</PromptInputProvider>
	);
}
