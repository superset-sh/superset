import { useMastraChatDisplay } from "@superset/chat-mastra/client";
import {
	type PromptInputMessage,
	PromptInputProvider,
} from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { ChatInputFooter } from "../../ChatPane/ChatInterface/components/ChatInputFooter";
import { MessageList } from "../../ChatPane/ChatInterface/components/MessageList";
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

type MastraHistoryMessage = NonNullable<
	ReturnType<typeof useMastraChatDisplay>["messages"]
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
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const currentSessionRef = useRef<string | null>(null);

	const chat = useMastraChatDisplay({
		sessionId,
		cwd,
		enabled: Boolean(sessionId),
		fps: 60,
	});
	const {
		commands,
		messages: historyMessages = null,
		currentMessage = null,
		pendingQuestion = null,
		isRunning = false,
		error = null,
	} = chat;

	useEffect(() => {
		if (currentSessionRef.current === sessionId) return;
		currentSessionRef.current = sessionId;
		setMessages([]);
	}, [sessionId]);

	useEffect(() => {
		if (!sessionId) {
			setMessages([]);
			return;
		}
		if (!historyMessages) return;
		setMessages(historyMessages.map(toUiMessage));
	}, [historyMessages, sessionId]);

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
			const previousMessage = prev[index];
			const previousText = previousMessage.parts
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("");
			const nextText = nextMessage.parts
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("");
			if (
				previousMessage.role === nextMessage.role &&
				previousText === nextText
			) {
				return prev;
			}
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

			await commands.sendMessage({
				payload: {
					content: text || "",
					...(images.length > 0 ? { images } : {}),
				},
			});
		},
		[appendUserMessage, commands],
	);

	const handleStop = useCallback(
		async (_event: React.MouseEvent) => {
			await commands.stop();
		},
		[commands],
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
					isStreaming={isRunning}
					workspaceId={workspaceId}
					onAnswer={handleAnswer}
				/>
				<ChatInputFooter
					cwd={cwd}
					error={error}
					canAbort={canAbort}
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
					onStop={handleStop}
					onSlashCommandSend={() => {}}
				/>
			</div>
		</PromptInputProvider>
	);
}
