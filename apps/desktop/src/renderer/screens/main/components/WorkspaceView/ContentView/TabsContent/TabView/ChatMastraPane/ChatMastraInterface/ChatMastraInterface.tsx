import { useMastraChatDisplay } from "@superset/chat-mastra/client";
import {
	type PromptInputMessage,
	PromptInputProvider,
} from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { ChatInputFooter } from "../../ChatPane/ChatInterface/components/ChatInputFooter";
import type {
	ModelOption,
	PermissionMode,
} from "../../ChatPane/ChatInterface/types";
import { ChatMastraMessageList } from "./components/ChatMastraMessageList";
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

export function ChatMastraInterface({
	sessionId,
	workspaceId: _workspaceId,
	cwd,
}: ChatMastraInterfaceProps) {
	const { models: availableModels, defaultModel } = useAvailableModels();
	const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
	const activeModel = selectedModel ?? defaultModel;
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");

	const {
		commands,
		messages,
		currentMessage,
		isRunning = false,
		error = null,
	} = useMastraChatDisplay({
		sessionId,
		cwd,
		enabled: Boolean(sessionId),
		fps: 60,
	});

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

			await commands.sendMessage({
				payload: {
					content: text || "",
					...(images.length > 0 ? { images } : {}),
				},
			});
		},
		[commands],
	);

	const handleStop = useCallback(
		async (_event: React.MouseEvent) => {
			await commands.stop();
		},
		[commands],
	);

	return (
		<PromptInputProvider>
			<div className="flex h-full flex-col bg-background">
				<ChatMastraMessageList
					messages={messages}
					isRunning={Boolean(isRunning)}
					currentMessage={currentMessage ?? null}
				/>
				<ChatInputFooter
					cwd={cwd}
					error={error}
					canAbort={Boolean(isRunning)}
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
