import {
	chatRuntimeServiceTrpc,
	chatServiceTrpc,
	type UseChatDisplayReturn,
	useChatDisplay,
} from "@superset/chat/client";
import {
	PromptInputAttachment,
	type PromptInputMessage,
	PromptInputProvider,
	useProviderAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatInputFooter } from "renderer/components/Chat/ChatInterface/components/ChatInputFooter";
import { useSlashCommandExecutor } from "renderer/components/Chat/ChatInterface/hooks/useSlashCommandExecutor";
import type {
	ModelOption,
	PermissionMode,
} from "renderer/components/Chat/ChatInterface/types";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getDesktopChatModelOptions } from "renderer/lib/dev-chat";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { chatModelsQueryKey } from "renderer/lib/model-provider-query-keys";
import { posthog } from "renderer/lib/posthog";
import { syncCloudModelProvidersToHost } from "renderer/lib/sync-cloud-model-providers";
import { useChatPreferencesStore } from "renderer/stores/chat-preferences";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ChatMessageList } from "./components/ChatMessageList";
import type { UserMessageRestartRequest } from "./components/ChatMessageList/ChatMessageList.types";
import { DraftSaver } from "./components/DraftSaver";
import { McpControls } from "./components/McpControls";
import { useMcpUi } from "./hooks/useMcpUi";
import { useOptimisticUpload } from "./hooks/useOptimisticUpload";
import type { ChatPaneInterfaceProps } from "./types";
import { toOptimisticUserMessage } from "./utils/optimisticUserMessage";
import {
	type ChatSendMessageInput,
	sendMessageForSession,
	toSendFailureMessage,
} from "./utils/sendMessage";
import {
	bindPendingUserTurnToSession,
	getVisibleMessagesWithPendingUserTurn,
	type PendingUserTurn,
	shouldClearPendingUserTurn,
	shouldRetainPendingUserTurnForSession,
} from "./utils/transientUserTurn";
import { uploadFiles } from "./utils/uploadFiles";

type HarnessFilePayload = {
	data: string;
	mediaType: string;
	filename?: string;
	uploaded?: boolean;
};

function ChatUploadFooter({
	sessionId,
	onError,
	onSend,
	...footerProps
}: {
	sessionId: string | null;
	onError: (message: string) => void;
	onSend: (payload: {
		content: string;
		files?: HarnessFilePayload[];
	}) => void | Promise<void>;
} & Omit<React.ComponentProps<typeof ChatInputFooter>, "onSend">) {
	const attachments = useProviderAttachments();
	const { entries, getUploadedFiles, isUploading } = useOptimisticUpload({
		sessionId,
		attachmentFiles: attachments.files,
		removeAttachment: attachments.remove,
		onError,
	});

	const handleSend = useCallback(
		(message: PromptInputMessage) => {
			const files = sessionId
				? (() => {
						const { files: uploadedFiles, ready } = getUploadedFiles();
						if (!ready) return null;
						return uploadedFiles.map((file) => ({
							data: file.url,
							mediaType: file.mediaType,
							filename: file.filename,
							uploaded: true,
						}));
					})()
				: (message.files ?? []).map((file) => ({
						data: file.url,
						mediaType: file.mediaType,
						filename: file.filename,
						uploaded: false,
					}));
			if (files === null) return;

			return onSend({
				content: message.text,
				files: files.length > 0 ? files : undefined,
			});
		},
		[getUploadedFiles, onSend, sessionId],
	);

	const renderAttachment = useCallback(
		(file: { id: string; type: "file"; url: string; mediaType: string }) => {
			if (!sessionId) {
				return <PromptInputAttachment data={file} />;
			}
			const entry = entries.get(file.id);
			const loading = entry?.uploading ?? !entries.has(file.id);
			return <PromptInputAttachment data={file} loading={loading} />;
		},
		[entries, sessionId],
	);

	return (
		<ChatInputFooter
			{...footerProps}
			submitDisabled={sessionId ? isUploading : false}
			renderAttachment={renderAttachment}
			onSend={handleSend}
		/>
	);
}

function toProviderModelOptions(
	providers: Awaited<ReturnType<typeof apiTrpcClient.modelProvider.list.query>>,
): ModelOption[] {
	return providers.flatMap((provider) => {
		if (!provider.enabled || !provider.hasSecret) return [];
		return provider.models
			.filter((model) => model.enabled)
			.map((model) => ({
				id: `${provider.id}/${model.modelId}`,
				modelId: model.modelId,
				name: model.displayName,
				provider: provider.name,
				providerId: provider.id,
				protocol: provider.protocol,
				baseUrl: provider.baseUrl,
				hasSecret: provider.hasSecret,
			}));
	});
}

function buildModelMetadata(model: ModelOption | null) {
	return {
		model: model?.modelId ?? model?.id,
		modelProviderId: model?.providerId,
		modelProviderName: model?.provider,
		modelProviderProtocol: model?.protocol,
	};
}

function useAvailableModels(workspaceId: string | null): {
	models: ModelOption[];
	defaultModel: ModelOption | null;
} {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const localModels = getDesktopChatModelOptions();
	const { data } = useQuery({
		queryKey: chatModelsQueryKey(
			hostUrl,
			workspaceId ? `workspace:${workspaceId}` : "standalone",
		),
		queryFn: async () => {
			if (!workspaceId) {
				const cloudProviders = await apiTrpcClient.modelProvider.list.query();
				const cloudModels = toProviderModelOptions(cloudProviders);
				if (cloudModels.length > 0) return { models: cloudModels };
				return apiTrpcClient.chat.getModels.query();
			}
			if (hostUrl) {
				await syncCloudModelProvidersToHost(hostUrl).catch((error) => {
					console.warn("[chat] Failed to sync cloud model providers", error);
				});
			}
			const providerModels = hostUrl
				? await getHostServiceClientByUrl(
						hostUrl,
					).modelProviders.listChatModels.query()
				: [];
			if (providerModels.length > 0) return { models: providerModels };
			const cloudProviders = await apiTrpcClient.modelProvider.list.query();
			const cloudModels = toProviderModelOptions(cloudProviders);
			if (cloudModels.length > 0) return { models: cloudModels };
			return apiTrpcClient.chat.getModels.query();
		},
		staleTime: 30_000,
	});
	const models =
		data?.models && data.models.length > 0 ? data.models : localModels;
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

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];
type ChatMessageContent = Array<ChatMessage["content"][number]>;

type InterruptedMessage = {
	id: string;
	sourceMessageId: string;
	content: ChatMessageContent;
};

type ChatAnalyticsProperties = Record<string, unknown>;

function cloneMessageContent(content: ChatMessageContent): ChatMessageContent {
	if (typeof structuredClone === "function") {
		return structuredClone(content) as ChatMessageContent;
	}
	try {
		return JSON.parse(JSON.stringify(content)) as ChatMessageContent;
	} catch {
		return content.map((part) => ({ ...part }));
	}
}

function getLaunchConfigKey(
	config: NonNullable<ChatPaneInterfaceProps["initialLaunchConfig"]>,
): string {
	return JSON.stringify({
		initialPrompt: config.initialPrompt ?? null,
		initialFiles: config.initialFiles ?? null,
		model: config.metadata?.model ?? null,
		retryCount: config.retryCount ?? null,
	});
}

export function ChatPaneInterface({
	paneId,
	sessionId,
	initialLaunchConfig,
	workspaceId,
	organizationId,
	cwd,
	isFocused,
	isSessionReady,
	ensureSessionReady,
	onStartFreshSession,
	onConsumeLaunchConfig,
	onUserMessageSubmitted,
	onSessionReady,
	placeholder,
	messageListTopInset = "default",
}: ChatPaneInterfaceProps) {
	const { models: availableModels, defaultModel } =
		useAvailableModels(workspaceId);
	const selectedModelId = useChatPreferencesStore(
		(state) => state.selectedModelId,
	);
	const setSelectedModelId = useChatPreferencesStore(
		(state) => state.setSelectedModelId,
	);
	const selectedModel =
		availableModels.find((model) => model.id === selectedModelId) ?? null;
	const activeModel = selectedModel ?? defaultModel;
	const activeModelMetadata = useMemo(
		() => buildModelMetadata(activeModel),
		[activeModel],
	);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const thinkingLevel = useChatPreferencesStore((state) => state.thinkingLevel);
	const setThinkingLevel = useChatPreferencesStore(
		(state) => state.setThinkingLevel,
	);
	const [permissionMode, setPermissionMode] = useState<PermissionMode>("auto");
	const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>(
		undefined,
	);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [interruptedMessage, setInterruptedMessage] =
		useState<InterruptedMessage | null>(null);
	const [approvalResponsePending, setApprovalResponsePending] = useState(false);
	const [planResponsePending, setPlanResponsePending] = useState(false);
	const [questionResponsePending, setQuestionResponsePending] = useState(false);
	const [answeredQuestionId, setAnsweredQuestionId] = useState<string | null>(
		null,
	);
	const [editingUserMessageId, setEditingUserMessageId] = useState<
		string | null
	>(null);
	const [pendingUserTurn, setPendingUserTurn] =
		useState<PendingUserTurn | null>(null);
	const currentMcpScopeRef = useRef<string | null>(null);
	const consumedLaunchConfigRef = useRef<string | null>(null);
	const isSendingRef = useRef(false);
	const previousSessionIdRef = useRef(sessionId);
	const autoLaunchInFlightRef = useRef<string | null>(null);
	const autoLaunchAttemptsRef = useRef<Record<string, number>>({});
	const autoLaunchSessionLockRef = useRef<Record<string, string | null>>({});
	const messagesLengthRef = useRef(0);
	const autoLaunchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const chatRuntimeServiceTrpcUtils = chatRuntimeServiceTrpc.useUtils();
	const authenticateMcpServerMutation =
		chatRuntimeServiceTrpc.workspace.authenticateMcpServer.useMutation();
	const captureChatEvent = useCallback(
		(event: string, properties?: ChatAnalyticsProperties) => {
			posthog.capture(event, {
				workspace_id: workspaceId,
				session_id: sessionId,
				organization_id: organizationId,
				...properties,
			});
		},
		[organizationId, sessionId, workspaceId],
	);

	const { data: slashCommands = [] } =
		chatServiceTrpc.workspace.getSlashCommands.useQuery(
			{ cwd },
			{ enabled: Boolean(cwd) },
		);

	const chat = useChatDisplay({
		sessionId,
		cwd,
		enabled: Boolean(sessionId) && (workspaceId !== null || isSessionReady),
		fps: 60,
	});
	const {
		commands,
		messages,
		currentMessage,
		isRunning = false,
		isConversationLoading = false,
		error = null,
		activeTools,
		toolInputBuffers,
		activeSubagents,
		pendingApproval = null,
		pendingPlanApproval = null,
		pendingQuestion = null,
	} = chat;
	const isAwaitingAssistant =
		isRunning || submitStatus === "submitted" || submitStatus === "streaming";

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
			captureChatEvent("chat_model_changed", {
				model_id: nextSelectedModel.id,
				model_name: nextSelectedModel.name,
				trigger: "picker",
			});
			setSelectedModelId(nextSelectedModel.id);
		},
		[captureChatEvent, selectedModel, setSelectedModelId],
	);

	const sendMessageToSession = useCallback(
		async (targetSessionId: string, input: ChatSendMessageInput) => {
			const queryInput = {
				sessionId: targetSessionId,
				...(cwd ? { cwd } : {}),
			};
			const optimisticMessage = toOptimisticUserMessage(input);
			if (optimisticMessage) {
				chatRuntimeServiceTrpcUtils.session.listMessages.setData(
					queryInput,
					(existingMessages = []) => [...existingMessages, optimisticMessage],
				);
			}

			try {
				await chatRuntimeServiceTrpcUtils.client.session.sendMessage.mutate({
					sessionId: targetSessionId,
					...(cwd ? { cwd } : {}),
					...input,
				});
				const [nextMessages, nextDisplayState] = await Promise.all([
					chatRuntimeServiceTrpcUtils.client.session.listMessages.query(
						queryInput,
					),
					chatRuntimeServiceTrpcUtils.client.session.getDisplayState.query(
						queryInput,
					),
				]);
				chatRuntimeServiceTrpcUtils.session.listMessages.setData(
					queryInput,
					nextMessages,
				);
				chatRuntimeServiceTrpcUtils.session.getDisplayState.setData(
					queryInput,
					nextDisplayState,
				);
			} catch (error) {
				if (optimisticMessage) {
					chatRuntimeServiceTrpcUtils.session.listMessages.setData(
						queryInput,
						(existingMessages = []) =>
							existingMessages.filter(
								(message) => message.id !== optimisticMessage.id,
							),
					);
				}
				throw error;
			}
		},
		[chatRuntimeServiceTrpcUtils, cwd],
	);

	const canAbort = Boolean(isRunning);
	const loadMcpOverview = useCallback(
		async (rootCwd: string) => {
			if (!sessionId) {
				return { sourcePath: null, servers: [] };
			}

			return chatRuntimeServiceTrpcUtils.workspace.getMcpOverview.fetch({
				sessionId,
				cwd: rootCwd,
			});
		},
		[chatRuntimeServiceTrpcUtils.workspace.getMcpOverview, sessionId],
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
		onTrackEvent: captureChatEvent,
	});
	const resetMcpUi = mcpUi.resetUi;
	const refreshMcpOverview = mcpUi.refreshOverview;

	const captureInterruptedMessage =
		useCallback((): InterruptedMessage | null => {
			if (!isRunning) return null;
			if (!currentMessage || currentMessage.role !== "assistant") return null;
			if (currentMessage.content.length === 0) return null;
			return {
				id: `interrupted:${currentMessage.id}`,
				sourceMessageId: currentMessage.id,
				content: cloneMessageContent(currentMessage.content),
			};
		}, [currentMessage, isRunning]);

	const stopActiveResponse = useCallback(async () => {
		clearRuntimeError();
		const snapshot = captureInterruptedMessage();
		try {
			await commands.stop();
		} catch (error) {
			setInterruptedMessage(null);
			setRuntimeErrorMessage(
				toErrorMessage(error) ?? "Failed to stop response",
			);
			return;
		}
		if (snapshot) {
			setInterruptedMessage(snapshot);
		}
		captureChatEvent("chat_turn_aborted", {
			model_id: activeModelMetadata.model ?? null,
		});
	}, [
		activeModelMetadata,
		captureChatEvent,
		captureInterruptedMessage,
		clearRuntimeError,
		commands,
		setRuntimeErrorMessage,
	]);

	const { resolveSlashCommandInput } = useSlashCommandExecutor({
		cwd,
		availableModels,
		canAbort,
		onStartFreshSession,
		onStopActiveResponse: () => {
			void stopActiveResponse();
		},
		onSelectModel: handleSelectModel,
		onOpenModelPicker: () => setModelSelectorOpen(true),
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onShowMcpOverview: mcpUi.showOverview,
		loadMcpOverview,
		onTrackEvent: captureChatEvent,
	});

	useEffect(() => {
		const scopeKey = `${sessionId ?? "no-session"}::${cwd || "no-cwd"}`;
		if (currentMcpScopeRef.current === scopeKey) return;
		currentMcpScopeRef.current = scopeKey;
		setSubmitStatus(undefined);
		setRuntimeError(null);
		setInterruptedMessage(null);
		setPendingUserTurn((previousTurn) => {
			return shouldRetainPendingUserTurnForSession({
				pendingUserTurn: previousTurn,
				sessionId,
			})
				? previousTurn
				: null;
		});
		setEditingUserMessageId(null);
		resetMcpUi();
		if (sessionId) {
			void refreshMcpOverview();
		}
	}, [cwd, refreshMcpOverview, resetMcpUi, sessionId]);

	const clearDraftInStore = useCallback(() => {
		if (!paneId) return;
		const { panes, setChatLaunchConfig } = useTabsStore.getState();
		setChatLaunchConfig(paneId, {
			...(panes[paneId]?.chat?.launchConfig ?? null),
			draftInput: undefined,
		});
	}, [paneId]);

	useEffect(() => {
		if (sessionId === previousSessionIdRef.current) return;
		previousSessionIdRef.current = sessionId;
		clearDraftInStore();
	}, [clearDraftInStore, sessionId]);

	// Reset optimistic hide when a new question arrives
	useEffect(() => {
		if (pendingQuestion && pendingQuestion.questionId !== answeredQuestionId) {
			setAnsweredQuestionId(null);
		}
	}, [pendingQuestion, answeredQuestionId]);

	useEffect(() => {
		if (
			shouldClearPendingUserTurn({
				messages,
				pendingUserTurn,
				isAwaitingAssistant,
			})
		) {
			setPendingUserTurn(null);
		}
	}, [isAwaitingAssistant, messages, pendingUserTurn]);

	useEffect(() => {
		if (!editingUserMessageId) return;
		if (messages.some((message) => message.id === editingUserMessageId)) return;
		setEditingUserMessageId(null);
	}, [editingUserMessageId, messages]);

	const visibleMessages = useMemo(() => {
		return getVisibleMessagesWithPendingUserTurn({
			messages,
			pendingUserTurn,
			isAwaitingAssistant,
		});
	}, [isAwaitingAssistant, messages, pendingUserTurn]);

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
		messagesLengthRef.current = messages?.length ?? 0;
	}, [messages]);

	const handleSend = useCallback(
		async (payload: { content: string; files?: HarnessFilePayload[] }) => {
			let content = payload.content.trim();

			const isSlashCommand = content.startsWith("/");
			const slashCommandResult = await resolveSlashCommandInput(content);
			if (slashCommandResult.handled) {
				setSubmitStatus(undefined);
				return;
			}
			content = slashCommandResult.nextText.trim();

			if (!content && (!payload.files || payload.files.length === 0)) {
				setSubmitStatus(undefined);
				return;
			}
			setInterruptedMessage(null);
			setSubmitStatus("submitted");
			clearRuntimeError();

			let effectiveSessionId = sessionId;
			let immediateUserMessage: ReturnType<
				typeof toOptimisticUserMessage
			> | null = null;
			let targetSessionId = effectiveSessionId;
			try {
				let preparedFiles = payload.files;
				if (preparedFiles?.some((file) => file.uploaded === false)) {
					if (!effectiveSessionId) {
						const startResult = await onStartFreshSession();
						if (!startResult.created || !startResult.sessionId) {
							throw new Error(
								startResult.errorMessage ??
									"Failed to create a chat session. Please retry.",
							);
						}
						effectiveSessionId = startResult.sessionId;
					}

					const uploadedFiles = await uploadFiles(
						effectiveSessionId,
						preparedFiles.map((file) => ({
							type: "file",
							url: file.data,
							mediaType: file.mediaType,
							filename: file.filename,
						})),
					);
					preparedFiles = uploadedFiles.map((file) => ({
						data: file.url,
						mediaType: file.mediaType,
						filename: file.filename,
						uploaded: true,
					}));
				}

				const sendInput: ChatSendMessageInput = {
					payload: {
						content,
						...(preparedFiles?.length
							? {
									files: preparedFiles.map(({ data, filename, mediaType }) => ({
										data,
										mediaType,
										filename,
									})),
								}
							: {}),
					},
					metadata: {
						...activeModelMetadata,
						thinkingLevel,
						permissionMode,
					},
				};
				immediateUserMessage = toOptimisticUserMessage(sendInput);
				if (immediateUserMessage) {
					setPendingUserTurn({
						kind: "append",
						sessionId: effectiveSessionId,
						message: immediateUserMessage,
					});
				}
				if (!effectiveSessionId) {
					const startResult = await onStartFreshSession();
					if (!startResult.created || !startResult.sessionId) {
						throw new Error(
							startResult.errorMessage ??
								"Failed to create a chat session. Please retry.",
						);
					}
					effectiveSessionId = startResult.sessionId;
				}
				targetSessionId = effectiveSessionId;
				if (immediateUserMessage) {
					const pendingMessageId = immediateUserMessage.id;
					const pendingSessionId = targetSessionId;
					setPendingUserTurn((previousTurn) =>
						bindPendingUserTurnToSession({
							pendingUserTurn: previousTurn,
							messageId: pendingMessageId,
							sessionId: pendingSessionId,
						}),
					);
				}
				if (targetSessionId !== sessionId) {
					onSessionReady?.(targetSessionId);
				}
				if (content) {
					onUserMessageSubmitted?.(content, targetSessionId);
				}

				isSendingRef.current = true;
				const sendResult =
					effectiveSessionId && effectiveSessionId !== sessionId
						? {
								targetSessionId: effectiveSessionId,
								value: await sendMessageToSession(
									effectiveSessionId,
									sendInput,
								),
							}
						: await sendMessageForSession({
								currentSessionId: effectiveSessionId,
								isSessionReady,
								ensureSessionReady,
								onStartFreshSession,
								sendToCurrentSession: () => commands.sendMessage(sendInput),
								sendToSession: (nextSessionId) =>
									sendMessageToSession(nextSessionId, sendInput),
							});
				targetSessionId = sendResult.targetSessionId;
				if (targetSessionId !== sessionId) {
					onSessionReady?.(targetSessionId);
				}
			} catch (error) {
				isSendingRef.current = false;
				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				if (immediateUserMessage) {
					const failedImmediateUserMessage = immediateUserMessage;
					setPendingUserTurn((previousTurn) =>
						previousTurn?.kind === "append" &&
						previousTurn.message.id === failedImmediateUserMessage.id
							? null
							: previousTurn,
					);
				}
				if (error instanceof Error) throw error;
				throw new Error(sendErrorMessage);
			}

			captureChatEvent("chat_message_sent", {
				session_id: targetSessionId,
				model_id: activeModelMetadata.model ?? null,
				mention_count: 0,
				attachment_count: payload.files?.length ?? 0,
				is_slash_command: isSlashCommand,
				message_length: content.length,
				turn_number: (messages?.length ?? 0) + 1,
			});

			clearDraftInStore();
		},
		[
			activeModelMetadata,
			captureChatEvent,
			clearRuntimeError,
			commands,
			isSessionReady,
			messages?.length,
			onStartFreshSession,
			onSessionReady,
			resolveSlashCommandInput,
			ensureSessionReady,
			sessionId,
			sendMessageToSession,
			setRuntimeErrorMessage,
			onUserMessageSubmitted,
			thinkingLevel,
			clearDraftInStore,
			permissionMode,
		],
	);

	useEffect(() => {
		if (!initialLaunchConfig) return;

		const launchConfigKey = getLaunchConfigKey(initialLaunchConfig);
		const attemptAutoLaunch = async (): Promise<void> => {
			if (consumedLaunchConfigRef.current === launchConfigKey) return;
			if (autoLaunchInFlightRef.current === launchConfigKey) return;

			const prompt = initialLaunchConfig.initialPrompt?.trim();
			const launchFiles = initialLaunchConfig.initialFiles;
			if (!prompt && !launchFiles?.length) {
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

			const launchModelMetadata = {
				...activeModelMetadata,
				model: initialLaunchConfig.metadata?.model ?? activeModelMetadata.model,
			};
			const sendInput: ChatSendMessageInput = {
				payload: {
					content: prompt ?? "",
					files: launchFiles,
				},
				metadata: {
					...launchModelMetadata,
					thinkingLevel,
					permissionMode,
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
				if (sendResult.targetSessionId !== sessionId) {
					onSessionReady?.(sendResult.targetSessionId);
				}
				if (prompt) {
					onUserMessageSubmitted?.(prompt, sendResult.targetSessionId);
				}

				autoLaunchInFlightRef.current = null;
				consumedLaunchConfigRef.current = launchConfigKey;
				delete autoLaunchAttemptsRef.current[launchConfigKey];
				delete autoLaunchSessionLockRef.current[launchConfigKey];
				onConsumeLaunchConfig();

				captureChatEvent("chat_message_sent", {
					session_id: sendResult.targetSessionId,
					model_id: launchModelMetadata.model ?? null,
					mention_count: 0,
					attachment_count: launchFiles?.length ?? 0,
					is_slash_command: false,
					message_length: prompt?.length ?? 0,
					turn_number: messagesLengthRef.current + 1,
					send_trigger: "launch-config",
				});
			} catch (error) {
				autoLaunchInFlightRef.current = null;

				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				console.debug("[chat] auto launch send failed", error);

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
		activeModelMetadata,
		captureChatEvent,
		clearRuntimeError,
		commands,
		ensureSessionReady,
		initialLaunchConfig,
		isSessionReady,
		onConsumeLaunchConfig,
		onStartFreshSession,
		onSessionReady,
		sendMessageToSession,
		sessionId,
		setRuntimeErrorMessage,
		onUserMessageSubmitted,
		thinkingLevel,
		permissionMode,
	]);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			await stopActiveResponse();
		},
		[stopActiveResponse],
	);

	const restartFromUserMessage = useCallback(
		async (
			request: UserMessageRestartRequest,
			options?: { trigger?: "edit" | "resend" },
		) => {
			if (!sessionId) {
				throw new Error("Chat session is still starting. Please retry.");
			}

			setInterruptedMessage(null);
			setPendingUserTurn(null);
			setSubmitStatus("submitted");
			clearRuntimeError();

			const optimisticMessage = toOptimisticUserMessage({
				payload: request.payload,
				metadata: {
					...activeModelMetadata,
					thinkingLevel,
					permissionMode,
				},
			});
			if (optimisticMessage) {
				setPendingUserTurn({
					kind: "restart",
					sessionId,
					prefixMessages: request.prefixMessages,
					message: optimisticMessage,
				});
			}

			try {
				await chatRuntimeServiceTrpcUtils.client.session.restartFromMessage.mutate(
					{
						sessionId,
						...(cwd ? { cwd } : {}),
						messageId: request.messageId,
						payload: request.payload,
						metadata: {
							...activeModelMetadata,
							thinkingLevel,
							permissionMode,
						},
					},
				);
				setEditingUserMessageId(null);
				if (request.payload.content) {
					onUserMessageSubmitted?.(request.payload.content, sessionId);
				}
				captureChatEvent("chat_message_sent", {
					session_id: sessionId,
					model_id: activeModelMetadata.model ?? null,
					mention_count: 0,
					attachment_count: request.payload.files?.length ?? 0,
					is_slash_command: false,
					message_length: request.payload.content.length,
					turn_number: (messages?.length ?? 0) + 1,
					send_trigger: options?.trigger ?? "resend",
					restarted_from_message_id: request.messageId,
				});

				clearDraftInStore();
			} catch (error) {
				setPendingUserTurn(null);
				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				if (error instanceof Error) throw error;
				throw new Error(sendErrorMessage);
			}
		},
		[
			activeModelMetadata,
			captureChatEvent,
			chatRuntimeServiceTrpcUtils.client.session.restartFromMessage,
			clearRuntimeError,
			cwd,
			messages,
			onUserMessageSubmitted,
			sessionId,
			setRuntimeErrorMessage,
			thinkingLevel,
			clearDraftInStore,
			permissionMode,
		],
	);
	const handleResendUserMessage = useCallback(
		async (request: UserMessageRestartRequest) => {
			await restartFromUserMessage(request, { trigger: "resend" });
		},
		[restartFromUserMessage],
	);
	const handleSubmitEditedUserMessage = useCallback(
		async (request: UserMessageRestartRequest) => {
			await restartFromUserMessage(request, { trigger: "edit" });
		},
		[restartFromUserMessage],
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
			setAnsweredQuestionId(trimmedQuestionId);
			setQuestionResponsePending(true);
			// Clear the orange dot immediately when the user submits their answer
			if (paneId) {
				useTabsStore.getState().setPaneStatus(paneId, "idle");
			}
			try {
				await commands.respondToQuestion({
					payload: {
						questionId: trimmedQuestionId,
						answer: trimmedAnswer,
					},
				});
			} catch (error) {
				// Roll back optimistic UI if the RPC fails
				setAnsweredQuestionId(null);
				if (paneId) {
					useTabsStore.getState().setPaneStatus(paneId, "permission");
				}
				throw error;
			} finally {
				setQuestionResponsePending(false);
			}
		},
		[clearRuntimeError, commands, paneId],
	);

	const errorMessage = runtimeError ?? toErrorMessage(error);

	return (
		<PromptInputProvider initialInput={initialLaunchConfig?.draftInput}>
			{paneId ? (
				<DraftSaver
					paneId={paneId}
					sessionId={sessionId}
					isSendingRef={isSendingRef}
				/>
			) : null}
			<div className="flex h-full flex-col bg-background">
				<ChatMessageList
					messages={visibleMessages}
					isFocused={isFocused}
					isRunning={canAbort}
					isConversationLoading={isConversationLoading}
					isAwaitingAssistant={isAwaitingAssistant}
					currentMessage={currentMessage ?? null}
					interruptedMessage={interruptedMessage}
					workspaceId={workspaceId ?? ""}
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
					editingUserMessageId={editingUserMessageId}
					isEditSubmitting={isAwaitingAssistant}
					onStartEditUserMessage={setEditingUserMessageId}
					onCancelEditUserMessage={() => setEditingUserMessageId(null)}
					onSubmitEditedUserMessage={handleSubmitEditedUserMessage}
					onRestartUserMessage={handleResendUserMessage}
					pendingQuestion={pendingQuestion}
					answeredQuestionId={answeredQuestionId}
					topInset={messageListTopInset}
				/>
				<McpControls mcpUi={mcpUi} />
				<ChatUploadFooter
					cwd={cwd}
					isFocused={isFocused}
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
					thinkingLevel={thinkingLevel}
					setThinkingLevel={setThinkingLevel}
					slashCommands={slashCommands}
					sessionId={sessionId}
					placeholder={placeholder}
					onError={setRuntimeErrorMessage}
					onSend={handleSend}
					onStop={handleStop}
					pendingQuestion={
						pendingQuestion?.questionId === answeredQuestionId
							? null
							: pendingQuestion
					}
					isQuestionSubmitting={questionResponsePending}
					onQuestionRespond={handleQuestionResponse}
					onQuestionCancel={() => void stopActiveResponse()}
				/>
			</div>
		</PromptInputProvider>
	);
}
