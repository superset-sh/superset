import { chatServiceTrpc } from "@superset/chat/client";
import {
	chatMastraServiceTrpc,
	type UseMastraChatDisplayReturn,
	useMastraChatDisplay,
} from "@superset/chat-mastra/client";
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
import type { UserMessageRestartRequest } from "./components/ChatMastraMessageList/ChatMastraMessageList.types";
import { McpControls } from "./components/McpControls";
import { useMcpUi } from "./hooks/useMcpUi";
import { useOptimisticUpload } from "./hooks/useOptimisticUpload";
import type { ChatMastraInterfaceProps } from "./types";
import { toOptimisticUserMessage } from "./utils/optimisticUserMessage";
import {
	type ChatSendMessageInput,
	sendMessageForSession,
	toSendFailureMessage,
} from "./utils/sendMessage";
import {
	getVisibleMessagesWithPendingUserTurn,
	type PendingUserTurn,
	shouldClearPendingUserTurn,
} from "./utils/transientUserTurn";
import { uploadFiles } from "./utils/uploadFiles";

type HarnessFilePayload = {
	data: string;
	mediaType: string;
	filename?: string;
	uploaded?: boolean;
};

function MastraUploadFooter({
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

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];

type InterruptedMessage = {
	id: string;
	sourceMessageId: string;
	content: MastraMessage["content"];
};

type ChatAnalyticsProperties = Record<string, unknown>;

function cloneMessageContent(
	content: MastraMessage["content"],
): MastraMessage["content"] {
	if (typeof structuredClone === "function") {
		return structuredClone(content);
	}
	try {
		return JSON.parse(JSON.stringify(content)) as MastraMessage["content"];
	} catch {
		return content.map((part) => ({ ...part }));
	}
}

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
	isFocused,
	isSessionReady,
	ensureSessionReady,
	onStartFreshSession,
	onConsumeLaunchConfig,
	onUserMessageSubmitted,
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
	const [interruptedMessage, setInterruptedMessage] =
		useState<InterruptedMessage | null>(null);
	const [approvalResponsePending, setApprovalResponsePending] = useState(false);
	const [planResponsePending, setPlanResponsePending] = useState(false);
	const [questionResponsePending, setQuestionResponsePending] = useState(false);
	const [editingUserMessageId, setEditingUserMessageId] = useState<
		string | null
	>(null);
	const [pendingUserTurn, setPendingUserTurn] =
		useState<PendingUserTurn | null>(null);
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
				chatMastraServiceTrpcUtils.session.listMessages.setData(
					queryInput,
					(existingMessages = []) => [...existingMessages, optimisticMessage],
				);
			}

			try {
				await chatMastraServiceTrpcUtils.client.session.sendMessage.mutate({
					sessionId: targetSessionId,
					...(cwd ? { cwd } : {}),
					...input,
				});
			} catch (error) {
				if (optimisticMessage) {
					chatMastraServiceTrpcUtils.session.listMessages.setData(
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
			model_id: activeModel?.id ?? null,
		});
	}, [
		activeModel?.id,
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
		setPendingUserTurn(null);
		setEditingUserMessageId(null);
		resetMcpUi();
		if (sessionId) {
			void refreshMcpOverview();
		}
	}, [cwd, refreshMcpOverview, resetMcpUi, sessionId]);

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

			let preparedFiles = payload.files;
			let effectiveSessionId = sessionId;

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
					model: activeModel?.id,
				},
			};
			const immediateUserMessage =
				effectiveSessionId && !isSessionReady
					? toOptimisticUserMessage(sendInput)
					: null;
			if (immediateUserMessage) {
				setPendingUserTurn({
					kind: "append",
					message: immediateUserMessage,
				});
			}

			let targetSessionId = effectiveSessionId;
			try {
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
				if (content) {
					onUserMessageSubmitted?.(content);
				}
			} catch (error) {
				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				if (immediateUserMessage) {
					setPendingUserTurn((previousTurn) =>
						previousTurn?.kind === "append" &&
						previousTurn.message.id === immediateUserMessage.id
							? null
							: previousTurn,
					);
				}
				if (error instanceof Error) throw error;
				throw new Error(sendErrorMessage);
			}

			captureChatEvent("chat_message_sent", {
				session_id: targetSessionId,
				model_id: activeModel?.id ?? null,
				mention_count: 0,
				attachment_count: payload.files?.length ?? 0,
				is_slash_command: isSlashCommand,
				message_length: content.length,
				turn_number: (messages?.length ?? 0) + 1,
			});
		},
		[
			activeModel?.id,
			captureChatEvent,
			clearRuntimeError,
			commands,
			isSessionReady,
			messages?.length,
			onStartFreshSession,
			resolveSlashCommandInput,
			ensureSessionReady,
			sessionId,
			sendMessageToSession,
			setRuntimeErrorMessage,
			onUserMessageSubmitted,
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
				onUserMessageSubmitted?.(prompt);

				autoLaunchInFlightRef.current = null;
				consumedLaunchConfigRef.current = launchConfigKey;
				delete autoLaunchAttemptsRef.current[launchConfigKey];
				delete autoLaunchSessionLockRef.current[launchConfigKey];
				onConsumeLaunchConfig();

				captureChatEvent("chat_message_sent", {
					session_id: sendResult.targetSessionId,
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
		captureChatEvent,
		clearRuntimeError,
		commands,
		ensureSessionReady,
		initialLaunchConfig,
		isSessionReady,
		onConsumeLaunchConfig,
		onStartFreshSession,
		sendMessageToSession,
		sessionId,
		setRuntimeErrorMessage,
		onUserMessageSubmitted,
	]);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			await stopActiveResponse();
		},
		[stopActiveResponse],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			void handleSend({ content: `/${command.name}` }).catch((error) => {
				console.debug("[chat-mastra] handleSlashCommandSend error", error);
			});
		},
		[handleSend],
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
					model: activeModel?.id,
				},
			});
			if (optimisticMessage) {
				setPendingUserTurn({
					kind: "restart",
					prefixMessages: request.prefixMessages,
					message: optimisticMessage,
				});
			}

			try {
				await chatMastraServiceTrpcUtils.client.session.restartFromMessage.mutate(
					{
						sessionId,
						...(cwd ? { cwd } : {}),
						messageId: request.messageId,
						payload: request.payload,
						metadata: {
							model: activeModel?.id,
						},
					},
				);
				setEditingUserMessageId(null);
				if (request.payload.content) {
					onUserMessageSubmitted?.(request.payload.content);
				}
				captureChatEvent("chat_message_sent", {
					session_id: sessionId,
					model_id: activeModel?.id ?? null,
					mention_count: 0,
					attachment_count: request.payload.files?.length ?? 0,
					is_slash_command: false,
					message_length: request.payload.content.length,
					turn_number: (messages?.length ?? 0) + 1,
					send_trigger: options?.trigger ?? "resend",
					restarted_from_message_id: request.messageId,
				});
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
			activeModel?.id,
			captureChatEvent,
			chatMastraServiceTrpcUtils.client.session.restartFromMessage,
			clearRuntimeError,
			cwd,
			messages,
			onUserMessageSubmitted,
			sessionId,
			setRuntimeErrorMessage,
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

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<ChatMastraMessageList
					messages={visibleMessages}
					isFocused={isFocused}
					isRunning={canAbort}
					isConversationLoading={isConversationLoading}
					isAwaitingAssistant={isAwaitingAssistant}
					currentMessage={currentMessage ?? null}
					interruptedMessage={interruptedMessage}
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
					editingUserMessageId={editingUserMessageId}
					isEditSubmitting={isAwaitingAssistant}
					onStartEditUserMessage={setEditingUserMessageId}
					onCancelEditUserMessage={() => setEditingUserMessageId(null)}
					onSubmitEditedUserMessage={handleSubmitEditedUserMessage}
					onRestartUserMessage={handleResendUserMessage}
				/>
				<McpControls mcpUi={mcpUi} />
				<MastraUploadFooter
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
					thinkingEnabled={thinkingEnabled}
					setThinkingEnabled={setThinkingEnabled}
					slashCommands={slashCommands}
					sessionId={sessionId}
					onError={setRuntimeErrorMessage}
					onSend={handleSend}
					onSubmitStart={() => setSubmitStatus("submitted")}
					onStop={handleStop}
					onSlashCommandSend={handleSlashCommandSend}
				/>
			</div>
		</PromptInputProvider>
	);
}
