import { chatServiceTrpc } from "@superset/chat/client";
import { useMastraChatDisplay } from "@superset/chat-mastra/client";
import {
	type PromptInputMessage,
	PromptInputProvider,
} from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus, UIMessage } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { ChatInputFooter } from "../../ChatPane/ChatInterface/components/ChatInputFooter";
import { MessageList } from "../../ChatPane/ChatInterface/components/MessageList";
import type { SlashCommand } from "../../ChatPane/ChatInterface/hooks/useSlashCommands";
import type {
	ModelOption,
	PermissionMode,
} from "../../ChatPane/ChatInterface/types";
import type { ChatMastraInterfaceProps } from "./types";

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

export function ChatMastraInterface({
	sessionId,
	organizationId,
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
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const currentSessionRef = useRef<string | null>(null);

	const { data: slashCommands = [] } =
		chatServiceTrpc.workspace.getSlashCommands.useQuery(
			{ cwd },
			{ enabled: Boolean(cwd) },
		);

	const chat = useMastraChatDisplay({
		sessionId,
		workspaceId,
		cwd,
		organizationId,
		enabled: Boolean(sessionId && organizationId),
		fps: 60,
	});

	useEffect(() => {
		if (currentSessionRef.current === sessionId) return;
		currentSessionRef.current = sessionId;
		setMessages([]);
		setSubmitStatus(undefined);
	}, [sessionId]);

	useEffect(() => {
		if (chat.displayState?.isRunning) {
			setSubmitStatus((prev) =>
				prev === "submitted" || prev === "streaming" ? "streaming" : prev,
			);
			return;
		}
		setSubmitStatus(undefined);
	}, [chat.displayState?.isRunning]);

	useEffect(() => {
		const currentMessage = chat.displayState?.currentMessage;
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
	}, [chat.displayState?.currentMessage]);

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
			if (!sessionId) return;
			const text = message.text.trim();
			const files = (message.files ?? []).map((file) => ({
				url: file.url,
				mediaType: file.mediaType,
				filename: file.filename,
			}));
			if (!text && files.length === 0) return;

			const messageId = crypto.randomUUID();
			appendUserMessage(messageId, message);
			setSubmitStatus("submitted");

			const accepted = await chat.sendMessage({
				content: text || undefined,
				files: files.length > 0 ? files : undefined,
				metadata: {
					model: activeModel?.id,
					permissionMode,
					thinkingEnabled,
				},
				clientMessageId: messageId,
			});

			if (!accepted.accepted) {
				setSubmitStatus(undefined);
			}
		},
		[
			activeModel?.id,
			appendUserMessage,
			chat,
			permissionMode,
			sessionId,
			thinkingEnabled,
		],
	);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			await chat.control({ action: "stop" });
		},
		[chat],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			void handleSend({ text: `/${command.name}`, files: [] });
		},
		[handleSend],
	);

	const handleAnswer = useCallback(
		async (_toolCallId: string, answers: Record<string, string>) => {
			const pendingQuestion = chat.displayState?.pendingQuestion;
			if (!pendingQuestion) return;
			const firstAnswer = Object.values(answers)[0];
			if (!firstAnswer) return;
			await chat.respondToQuestion({
				questionId: pendingQuestion.questionId,
				answer: firstAnswer,
			});
		},
		[chat],
	);

	const canAbort = Boolean(chat.displayState?.isRunning);
	const errorMessage = toErrorMessage(chat.error) ?? chat.reason;
	const mergedMessages = useMemo(() => messages, [messages]);

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<MessageList
					messages={mergedMessages}
					isStreaming={canAbort}
					submitStatus={submitStatus}
					workspaceId={workspaceId}
					onAnswer={handleAnswer}
				/>
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
