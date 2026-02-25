import { chatServiceTrpc } from "@superset/chat/client";
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
import type { SlashCommand } from "../../ChatPane/ChatInterface/hooks/useSlashCommands";
import type {
	ModelOption,
	PermissionMode,
} from "../../ChatPane/ChatInterface/types";
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
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const currentSessionRef = useRef<string | null>(null);

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
		currentMessage = null,
		isRunning = false,
		pendingQuestion = null,
	} = chat;

	useEffect(() => {
		if (currentSessionRef.current === sessionId) return;
		currentSessionRef.current = sessionId;
		setMessages([]);
		setSubmitStatus(undefined);
	}, [sessionId]);

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
			if (!sessionId) return;
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

			await commands.sendMessage({
				payload: {
					content: text || "",
					...(images.length > 0 ? { images } : {}),
				},
			});
		},
		[appendUserMessage, commands, sessionId],
	);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			await commands.stop();
		},
		[commands],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			void handleSend({ text: `/${command.name}`, files: [] });
		},
		[handleSend],
	);

	const handleAnswer = useCallback(
		async (_toolCallId: string, answers: Record<string, string>) => {
			if (!pendingQuestion) return;
			const firstAnswer = Object.values(answers)[0];
			if (!firstAnswer) return;
			await commands.respondToQuestion({
				payload: {
					questionId: pendingQuestion.questionId,
					answer: firstAnswer,
				},
			});
		},
		[commands, pendingQuestion],
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
					error={null}
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
