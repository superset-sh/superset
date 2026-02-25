import { useMastraChatDisplay } from "@superset/chat-mastra/client";
import {
	type PromptInputMessage,
	PromptInputProvider,
} from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus, UIMessage } from "ai";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { ChatInputFooter } from "../../ChatPane/ChatInterface/components/ChatInputFooter";
import { MessageList } from "../../ChatPane/ChatInterface/components/MessageList";
import type {
	ModelOption,
	PermissionMode,
} from "../../ChatPane/ChatInterface/types";
import { reportChatMastraError } from "../utils/reportChatMastraError";
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

function messageTextFromDisplay(currentMessage: {
	content: Array<{ type: string; text?: string; thinking?: string }>;
}): string {
	return currentMessage.content
		.map((part) => {
			if (part.type === "text" && typeof part.text === "string")
				return part.text;
			if (part.type === "thinking" && typeof part.thinking === "string") {
				return part.thinking;
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unexpected chat error";
}

type MastraHistoryMessage = NonNullable<
	ReturnType<typeof useMastraChatDisplay>["historyMessages"]
>[number];

function toUiMessage(message: MastraHistoryMessage): UIMessage {
	const text = messageTextFromDisplay(message);
	return {
		id: message.id,
		role: message.role,
		parts: text ? [{ type: "text", text }] : [],
	};
}

export function ChatMastraInterface({
	sessionId,
	workspaceId,
	cwd,
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
	const [error, setError] = useState<string | null>(null);
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const currentSessionRef = useRef<string | null>(null);
	const lastReportedTransportErrorRef = useRef<string | null>(null);

	const chat = useMastraChatDisplay({
		sessionId,
		cwd,
		enabled: Boolean(sessionId),
		fps: 60,
	});
	const {
		commands,
		currentMessage = null,
		historyMessages = null,
		isRunning = false,
		pendingQuestion = null,
		transportError = null,
	} = chat;

	useEffect(() => {
		if (currentSessionRef.current === sessionId) return;
		currentSessionRef.current = sessionId;
		setMessages([]);
		setSubmitStatus(undefined);
		setError(null);
	}, [sessionId]);

	useEffect(() => {
		if (!transportError) return;
		const message = toErrorMessage(transportError);
		if (lastReportedTransportErrorRef.current === message) return;
		lastReportedTransportErrorRef.current = message;

		setError(message);
		reportChatMastraError({
			operation: "display.poll",
			error: transportError,
			sessionId,
			workspaceId,
			cwd,
		});
	}, [cwd, sessionId, transportError, workspaceId]);

	useEffect(() => {
		if (!sessionId) {
			setMessages([]);
			return;
		}
		if (!historyMessages) return;
		setMessages(historyMessages.map(toUiMessage));
	}, [historyMessages, sessionId]);

	useEffect(() => {
		if (isRunning) {
			setSubmitStatus((prev) =>
				prev === "submitted" || prev === "streaming" ? "streaming" : prev,
			);
			return;
		}
		setSubmitStatus(undefined);
	}, [isRunning]);

	useEffect(() => {
		if (!currentMessage) return;

		const text = messageTextFromDisplay(currentMessage);
		const nextMessage: UIMessage = {
			id: currentMessage.id,
			role: currentMessage.role,
			parts: text ? [{ type: "text", text }] : [],
		};

		setMessages((prev) => {
			const index = prev.findIndex((message) => message.id === nextMessage.id);
			if (index < 0) return [...prev, nextMessage];
			const copy = [...prev];
			copy[index] = nextMessage;
			return copy;
		});
	}, [currentMessage]);

	const appendUserMessage = useCallback(
		(messageId: string, message: PromptInputMessage) => {
			const text = message.text.trim();
			const files = (message.files ?? []).map((file) => ({
				type: "file" as const,
				url: file.url,
				mediaType: file.mediaType,
				filename: file.filename,
			}));

			const next: UIMessage = {
				id: messageId,
				role: "user",
				parts: [...(text ? [{ type: "text" as const, text }] : []), ...files],
			};

			setMessages((prev) => [...prev, next]);
		},
		[],
	);

	const handleSend = useCallback(
		async (message: PromptInputMessage) => {
			if (!sessionId) {
				const error = new Error("No active chat session");
				setError(error.message);
				reportChatMastraError({
					operation: "message.send.no_session",
					error,
					sessionId,
					workspaceId,
					cwd,
				});
				return;
			}
			const text = message.text.trim();
			const files = (message.files ?? []).map((file) => ({
				url: file.url,
				mediaType: file.mediaType,
				filename: file.filename,
			}));
			const images = toMastraImages(files);
			if (!text && images.length === 0) return;

			const messageId = crypto.randomUUID();
			appendUserMessage(messageId, message);
			setSubmitStatus("submitted");

			try {
				await commands.sendMessage({
					payload: {
						content: text || "",
						...(images.length > 0 ? { images } : {}),
					},
				});
				setError(null);
			} catch (error) {
				setSubmitStatus(undefined);
				setError(toErrorMessage(error));
				reportChatMastraError({
					operation: "message.send",
					error,
					sessionId,
					workspaceId,
					cwd,
				});
			}
		},
		[appendUserMessage, commands, cwd, sessionId, workspaceId],
	);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			try {
				await commands.stop();
			} catch (error) {
				setError(toErrorMessage(error));
				reportChatMastraError({
					operation: "message.stop",
					error,
					sessionId,
					workspaceId,
					cwd,
				});
			}
		},
		[commands, cwd, sessionId, workspaceId],
	);

	const handleAnswer = useCallback(
		async (_toolCallId: string, answers: Record<string, string>) => {
			if (!pendingQuestion) return;
			const firstAnswer = Object.values(answers)[0];
			if (!firstAnswer) return;
			try {
				await commands.respondToQuestion({
					payload: {
						questionId: pendingQuestion.questionId,
						answer: firstAnswer,
					},
				});
				setError(null);
			} catch (error) {
				setError(toErrorMessage(error));
				reportChatMastraError({
					operation: "question.respond",
					error,
					sessionId,
					workspaceId,
					cwd,
				});
			}
		},
		[commands, cwd, pendingQuestion, sessionId, workspaceId],
	);

	const canAbort = Boolean(isRunning);

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<MessageList
					messages={messages}
					isStreaming={canAbort}
					submitStatus={submitStatus}
					workspaceId={workspaceId}
					onAnswer={handleAnswer}
				/>
				<ChatInputFooter
					cwd={cwd}
					error={error}
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
					slashCommands={[]}
					onSend={(message) => {
						void handleSend(message);
					}}
					onSubmitStart={() => setSubmitStatus("submitted")}
					onSubmitEnd={() => {
						if (!canAbort) setSubmitStatus(undefined);
					}}
					onStop={handleStop}
					onSlashCommandSend={() => {}}
				/>
			</div>
		</PromptInputProvider>
	);
}
