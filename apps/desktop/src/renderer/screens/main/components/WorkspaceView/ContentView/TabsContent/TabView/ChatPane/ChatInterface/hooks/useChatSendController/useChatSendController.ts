import type { UseChatReturn } from "@superset/chat/client";
import { chatServiceTrpc } from "@superset/chat/client";
import type { PromptInputMessage } from "@superset/ui/ai-elements/prompt-input";
import type { ChatStatus, FileUIPart } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { getAuthToken } from "renderer/lib/auth-client";

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
	metadata: ChatMessageMetadata;
}

interface ChatMessageMetadata {
	model?: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
}

interface UseChatSendControllerOptions {
	chat: UseChatReturn;
	sessionId: string | null;
	organizationId: string | null;
	deviceId: string | null;
	workspaceId?: string;
	paneId: string;
	cwd: string;
	messageMetadata: ChatMessageMetadata;
	switchChatSession: (paneId: string, sessionId: string) => void;
}

interface UseChatSendControllerReturn {
	pendingMessages: PendingUserMessage[];
	runtimeError: string | null;
	handleSend: (message: PromptInputMessage) => void;
	stopPendingSends: () => void;
	markSubmitStarted: () => void;
	markSubmitEnded: () => void;
	canAbort: boolean;
	submitStatus: ChatStatus | undefined;
}

interface SendPreparedMessageArgs {
	messageId: string;
	text: string;
	files?: FileUIPart[];
	metadata?: ChatMessageMetadata;
	signal?: AbortSignal;
}

interface SendToSessionArgs {
	targetSessionId: string;
	messageId: string;
	text: string;
	files: FileUIPart[];
	metadata: ChatMessageMetadata;
	signal?: AbortSignal;
}

interface CreateAndQueueSessionSendArgs {
	messageId: string;
	text: string;
	files: FileUIPart[];
	metadata: ChatMessageMetadata;
	signal: AbortSignal;
}

async function getHttpErrorDetail(response: Response): Promise<string> {
	const errorBody = await response
		.text()
		.then((text) => text.trim())
		.catch(() => "");
	const statusText = response.statusText ? ` ${response.statusText}` : "";
	const detail = errorBody ? ` - ${errorBody.slice(0, 500)}` : "";
	return `${response.status}${statusText}${detail}`;
}

async function createSession(
	sessionId: string,
	organizationId: string,
	deviceId: string | null,
	workspaceId?: string,
	signal?: AbortSignal,
): Promise<void> {
	const token = getAuthToken();
	const response = await fetch(`${apiUrl}/api/chat/${sessionId}`, {
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
	if (!response.ok) {
		const detail = await getHttpErrorDetail(response);
		throw new Error(`Failed to create session ${sessionId}: ${detail}`);
	}
}

async function uploadFile(
	sessionId: string,
	file: FileUIPart,
	signal?: AbortSignal,
): Promise<FileUIPart> {
	const response = await fetch(file.url, { signal });
	if (!response.ok) {
		const detail = await getHttpErrorDetail(response);
		throw new Error(`Failed to fetch attachment ${file.url}: ${detail}`);
	}
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
		const detail = await getHttpErrorDetail(res);
		throw new Error(`Upload failed for session ${sessionId}: ${detail}`);
	}

	const result: { url: string; mediaType: string; filename?: string } =
		await res.json();
	return { type: "file", ...result };
}

function createAbortError(): Error {
	const error = new Error("The operation was aborted");
	error.name = "AbortError";
	return error;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw createAbortError();
	}
}

function isAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === "AbortError";
}

export function useChatSendController(
	options: UseChatSendControllerOptions,
): UseChatSendControllerReturn {
	const {
		chat,
		sessionId,
		organizationId,
		deviceId,
		workspaceId,
		paneId,
		cwd,
		messageMetadata,
		switchChatSession,
	} = options;

	const [pendingMessages, setPendingMessages] = useState<PendingUserMessage[]>(
		[],
	);
	const [queuedPendingMessage, setQueuedPendingMessage] =
		useState<QueuedPendingMessage | null>(null);
	const [isPreparingSubmit, setIsPreparingSubmit] = useState(false);
	const [awaitingAssistantIds, setAwaitingAssistantIds] = useState<string[]>(
		[],
	);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);

	const ensureRuntimeMutation =
		chatServiceTrpc.session.ensureRuntime.useMutation();
	const ensureRuntimeMutationRef = useRef(ensureRuntimeMutation);
	ensureRuntimeMutationRef.current = ensureRuntimeMutation;

	const sendAbortControllersRef = useRef(new Map<string, AbortController>());
	const sendingQueuedMessageIdRef = useRef<string | null>(null);

	const setRuntimeErrorMessage = useCallback(
		(error: unknown, fallback: string) => {
			setRuntimeError(error instanceof Error ? error.message : fallback);
		},
		[],
	);

	const removePendingMessage = useCallback((messageId: string) => {
		setPendingMessages((prev) => {
			const next = prev.filter((message) => message.id !== messageId);
			return next.length === prev.length ? prev : next;
		});
	}, []);

	const clearQueuedPendingMessage = useCallback((messageId: string) => {
		setQueuedPendingMessage((prev) => (prev?.id === messageId ? null : prev));
	}, []);

	const addAwaitingAssistant = useCallback((messageId: string) => {
		setAwaitingAssistantIds((prev) =>
			prev.includes(messageId) ? prev : [...prev, messageId],
		);
	}, []);

	const removeAwaitingAssistant = useCallback((messageId: string) => {
		setAwaitingAssistantIds((prev) => {
			const next = prev.filter((id) => id !== messageId);
			return next.length === prev.length ? prev : next;
		});
	}, []);

	const clearAwaitingAssistant = useCallback(() => {
		setAwaitingAssistantIds((prev) => (prev.length === 0 ? prev : []));
	}, []);

	const abortAllInFlightSends = useCallback(() => {
		for (const controller of sendAbortControllersRef.current.values()) {
			controller.abort();
		}
		sendAbortControllersRef.current.clear();
		sendingQueuedMessageIdRef.current = null;
		setQueuedPendingMessage(null);
		setPendingMessages([]);
		clearAwaitingAssistant();
	}, [clearAwaitingAssistant]);

	const ensureRuntimeReady = useCallback(
		async (targetSessionId: string) => {
			const runtime = await ensureRuntimeMutationRef.current.mutateAsync({
				sessionId: targetSessionId,
				cwd,
			});
			if (!runtime.ready) {
				throw new Error(
					runtime.reason ?? "Session runtime is not ready on this device",
				);
			}
		},
		[cwd],
	);

	const uploadAttachments = useCallback(
		async (
			targetSessionId: string,
			files: FileUIPart[],
			signal?: AbortSignal,
		): Promise<FileUIPart[] | undefined> => {
			if (files.length === 0) return undefined;
			return Promise.all(
				files.map((file) => uploadFile(targetSessionId, file, signal)),
			);
		},
		[],
	);

	const sendPreparedMessage = useCallback(
		async ({
			messageId,
			text,
			files,
			metadata,
			signal,
		}: SendPreparedMessageArgs) => {
			throwIfAborted(signal);
			setRuntimeError(null);
			await chat.sendMessage(text, files, metadata, {
				messageId,
				signal,
			});
		},
		[chat.sendMessage],
	);

	const sendToSession = useCallback(
		async ({
			targetSessionId,
			messageId,
			text,
			files,
			metadata,
			signal,
		}: SendToSessionArgs) => {
			await ensureRuntimeReady(targetSessionId);
			const uploadedFiles = await uploadAttachments(
				targetSessionId,
				files,
				signal,
			);
			await sendPreparedMessage({
				messageId,
				text,
				files: uploadedFiles,
				metadata,
				signal,
			});
		},
		[ensureRuntimeReady, uploadAttachments, sendPreparedMessage],
	);

	const createAndQueueSessionSend = useCallback(
		async ({
			messageId,
			text,
			files,
			metadata,
			signal,
		}: CreateAndQueueSessionSendArgs) => {
			if (!organizationId) {
				throw new Error("Organization is required to start a chat session");
			}

			const newSessionId = crypto.randomUUID();
			await createSession(
				newSessionId,
				organizationId,
				deviceId,
				workspaceId,
				signal,
			);
			const uploadedFiles =
				(await uploadAttachments(newSessionId, files, signal)) ?? [];
			throwIfAborted(signal);

			setQueuedPendingMessage({
				id: messageId,
				text,
				files: uploadedFiles,
				metadata,
			});
			switchChatSession(paneId, newSessionId);
		},
		[
			organizationId,
			deviceId,
			workspaceId,
			uploadAttachments,
			switchChatSession,
			paneId,
		],
	);

	useEffect(() => {
		if (!chat.ready || !queuedPendingMessage || !sessionId) return;
		if (sendingQueuedMessageIdRef.current === queuedPendingMessage.id) return;

		let cancelled = false;
		sendingQueuedMessageIdRef.current = queuedPendingMessage.id;

		void (async () => {
			const abortController = sendAbortControllersRef.current.get(
				queuedPendingMessage.id,
			);
			try {
				throwIfAborted(abortController?.signal);
				await ensureRuntimeReady(sessionId);
				if (cancelled) return;
				await sendPreparedMessage({
					messageId: queuedPendingMessage.id,
					text: queuedPendingMessage.text,
					files:
						queuedPendingMessage.files.length > 0
							? queuedPendingMessage.files
							: undefined,
					metadata: queuedPendingMessage.metadata,
					signal: abortController?.signal,
				});
				if (cancelled) return;
				clearQueuedPendingMessage(queuedPendingMessage.id);
			} catch (err) {
				if (cancelled) return;
				if (isAbortError(err)) {
					removeAwaitingAssistant(queuedPendingMessage.id);
					return;
				}
				removePendingMessage(queuedPendingMessage.id);
				removeAwaitingAssistant(queuedPendingMessage.id);
				clearQueuedPendingMessage(queuedPendingMessage.id);
				setRuntimeErrorMessage(err, "Failed to start session runtime");
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
		clearQueuedPendingMessage,
		ensureRuntimeReady,
		removePendingMessage,
		removeAwaitingAssistant,
		sendPreparedMessage,
		setRuntimeErrorMessage,
	]);

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

	const assistantMessageCount = useMemo(
		() =>
			chat.messages.filter((message) => message.role === "assistant").length,
		[chat.messages],
	);

	const prevAssistantMessageCountRef = useRef(assistantMessageCount);
	useEffect(() => {
		const prevCount = prevAssistantMessageCountRef.current;
		const assistantCountAdvanced = assistantMessageCount > prevCount;
		prevAssistantMessageCountRef.current = assistantMessageCount;
		if (awaitingAssistantIds.length === 0) return;

		if (!assistantCountAdvanced && !chat.isLoading) return;
		clearAwaitingAssistant();
	}, [
		chat.isLoading,
		assistantMessageCount,
		awaitingAssistantIds.length,
		clearAwaitingAssistant,
	]);

	const handleSend = useCallback(
		(message: PromptInputMessage) => {
			const text = message.text.trim();
			const files = message.files ?? [];
			const metadataSnapshot = { ...messageMetadata };
			if (!text && files.length === 0) {
				setIsPreparingSubmit(false);
				return;
			}
			setIsPreparingSubmit(false);

			const messageId = crypto.randomUUID();
			addAwaitingAssistant(messageId);
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
					throwIfAborted(abortController.signal);

					if (sessionId) {
						await sendToSession({
							targetSessionId: sessionId,
							messageId,
							text,
							files,
							metadata: metadataSnapshot,
							signal: abortController.signal,
						});
						return;
					}

					await createAndQueueSessionSend({
						messageId,
						text,
						files,
						metadata: metadataSnapshot,
						signal: abortController.signal,
					});
					handedOffToQueue = true;
				} catch (err) {
					if (isAbortError(err)) {
						removeAwaitingAssistant(messageId);
						return;
					}
					removePendingMessage(messageId);
					removeAwaitingAssistant(messageId);
					setRuntimeErrorMessage(err, "Failed to send message");
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
			messageMetadata,
			sendToSession,
			createAndQueueSessionSend,
			removePendingMessage,
			addAwaitingAssistant,
			removeAwaitingAssistant,
			setRuntimeErrorMessage,
		],
	);

	const stopPendingSends = useCallback(() => {
		abortAllInFlightSends();
		setIsPreparingSubmit(false);
		setRuntimeError(null);
	}, [abortAllInFlightSends]);

	const markSubmitStarted = useCallback(() => {
		setIsPreparingSubmit(true);
	}, []);

	const markSubmitEnded = useCallback(() => {
		setIsPreparingSubmit(false);
	}, []);

	const isSubmitted =
		isPreparingSubmit ||
		pendingMessages.length > 0 ||
		awaitingAssistantIds.length > 0;
	const isStreaming = chat.isLoading;
	const canAbort = isStreaming || isSubmitted;
	const submitStatus: ChatStatus | undefined = useMemo(
		() => (isStreaming ? "streaming" : isSubmitted ? "submitted" : undefined),
		[isStreaming, isSubmitted],
	);

	return {
		pendingMessages,
		runtimeError,
		handleSend,
		stopPendingSends,
		markSubmitStarted,
		markSubmitEnded,
		canAbort,
		submitStatus,
	};
}
