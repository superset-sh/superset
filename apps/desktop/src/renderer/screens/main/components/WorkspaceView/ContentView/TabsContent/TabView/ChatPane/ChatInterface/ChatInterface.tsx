import { useDurableChat } from "@superset/durable-session/react";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@superset/ui/ai-elements/suggestion";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	HiMiniAtSymbol,
	HiMiniChatBubbleLeftRight,
	HiMiniPaperClip,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { ContextIndicator } from "./components/ContextIndicator";
import { ModelPicker } from "./components/ModelPicker";
import { MODELS, SUGGESTIONS } from "./constants";
import type { ModelOption } from "./types";

interface ChatInterfaceProps {
	sessionId: string;
	workspaceId: string;
	cwd: string;
}

export function ChatInterface({
	sessionId,
	workspaceId,
	cwd,
}: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[1]);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

	const { data: config } = electronTrpc.aiChat.getConfig.useQuery();

	const {
		messages,
		sendMessage,
		isLoading,
		error,
		connectionStatus,
		stop,
		addToolApprovalResponse,
		connect,
	} = useDurableChat({
		sessionId,
		proxyUrl: config?.proxyUrl ?? "http://localhost:8080",
		autoConnect: false,
		stream: config?.authToken
			? { headers: { Authorization: `Bearer ${config.authToken}` } }
			: undefined,
	});

	const connectRef = useRef(connect);
	connectRef.current = connect;
	const hasConnected = useRef(false);

	const doConnect = useCallback(() => {
		if (hasConnected.current) return;
		hasConnected.current = true;
		console.log("[chat] Connecting to proxy...");
		connectRef.current().catch((err) => {
			console.error("[chat] Connect failed:", err);
			hasConnected.current = false;
		});
	}, []);

	const [sessionReady, setSessionReady] = useState(false);

	const startSession = electronTrpc.aiChat.startSession.useMutation({
		onSuccess: () => {
			console.log("[chat] Session started");
			setSessionReady(true);
		},
		onError: (err) => {
			console.error("[chat] Start session failed:", err);
		},
	});
	const restoreSession = electronTrpc.aiChat.restoreSession.useMutation({
		onSuccess: () => {
			console.log("[chat] Session restored");
			setSessionReady(true);
		},
		onError: (err) => {
			console.error("[chat] Restore session failed:", err);
		},
	});
	const stopSession = electronTrpc.aiChat.stopSession.useMutation();
	const renameSession = electronTrpc.aiChat.renameSession.useMutation();

	const startSessionRef = useRef(startSession);
	startSessionRef.current = startSession;
	const restoreSessionRef = useRef(restoreSession);
	restoreSessionRef.current = restoreSession;
	const stopSessionRef = useRef(stopSession);
	stopSessionRef.current = stopSession;
	const renameSessionRef = useRef(renameSession);
	renameSessionRef.current = renameSession;

	const { data: existingSession } = electronTrpc.aiChat.getSession.useQuery(
		{ sessionId },
		{ enabled: !!sessionId },
	);

	useEffect(() => {
		if (!sessionId || !cwd) return;
		if (existingSession === undefined) return;

		hasConnected.current = false;
		setSessionReady(false);

		if (existingSession) {
			restoreSessionRef.current.mutate({ sessionId, cwd });
		} else {
			startSessionRef.current.mutate({
				sessionId,
				workspaceId,
				cwd,
			});
		}

		return () => {
			stopSessionRef.current.mutate({ sessionId });
		};
	}, [sessionId, cwd, workspaceId, existingSession]);

	useEffect(() => {
		if (sessionReady && config?.proxyUrl) {
			doConnect();
		}
	}, [sessionReady, config?.proxyUrl, doConnect]);

	const hasAutoTitled = useRef(false);
	useEffect(() => {
		if (hasAutoTitled.current) return;
		if (!sessionId) return;

		const userMsg = messages.find((m) => m.role === "user");
		const assistantMsg = messages.find((m) => m.role === "assistant");
		if (!userMsg || !assistantMsg) return;

		hasAutoTitled.current = true;

		const textPart = userMsg.parts?.find((p) => p.type === "text");
		const firstUserText =
			(textPart && "content" in textPart
				? (textPart.content as string)
				: undefined
			)?.slice(0, 80) ?? "Chat";
		const title =
			firstUserText.length === 80 ? `${firstUserText}...` : firstUserText;

		renameSessionRef.current.mutate({ sessionId, title });
	}, [messages, sessionId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: must reset when session changes
	useEffect(() => {
		hasAutoTitled.current = false;
	}, [sessionId]);

	const handleSend = useCallback(
		(message: { text: string }) => {
			if (!message.text.trim()) return;
			sendMessage(message.text).catch((err) => {
				console.error("[chat] Send failed:", err);
			});
		},
		[sendMessage],
	);

	const handleSuggestion = useCallback(
		(suggestion: string) => {
			handleSend({ text: suggestion });
		},
		[handleSend],
	);

	const handleApprove = useCallback(
		(approvalId: string) => {
			addToolApprovalResponse({ id: approvalId, approved: true });
		},
		[addToolApprovalResponse],
	);

	const handleDeny = useCallback(
		(approvalId: string) => {
			addToolApprovalResponse({ id: approvalId, approved: false });
		},
		[addToolApprovalResponse],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			stop();
		},
		[stop],
	);

	return (
		<div className="flex h-full flex-col bg-background">
			{error && (
				<div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error.message}
				</div>
			)}
			{connectionStatus !== "connected" &&
				connectionStatus !== "disconnected" && (
					<div className="border-b px-4 py-1 text-xs text-muted-foreground">
						Connection: {connectionStatus}
					</div>
				)}
			<Conversation className="flex-1">
				<ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
					{messages.length === 0 ? (
						<>
							<ConversationEmptyState
								title="Start a conversation"
								description="Ask anything to get started"
								icon={<HiMiniChatBubbleLeftRight className="size-8" />}
							/>
							<Suggestions className="justify-center">
								{SUGGESTIONS.map((s) => (
									<Suggestion
										key={s}
										suggestion={s}
										onClick={handleSuggestion}
									/>
								))}
							</Suggestions>
						</>
					) : (
						messages.map((msg) => (
							<ChatMessageItem
								key={msg.id}
								message={msg}
								onApprove={handleApprove}
								onDeny={handleDeny}
							/>
						))
					)}
					{isLoading && (
						<Message from="assistant">
							<MessageContent>
								<Shimmer className="text-sm" duration={1.5}>
									Thinking...
								</Shimmer>
							</MessageContent>
						</Message>
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="border-t bg-background px-4 py-3">
				<div className="mx-auto w-full max-w-3xl">
					{messages.length > 0 && (
						<Suggestions className="mb-3">
							{SUGGESTIONS.map((s) => (
								<Suggestion key={s} suggestion={s} onClick={handleSuggestion} />
							))}
						</Suggestions>
					)}
					<PromptInput onSubmit={handleSend}>
						<PromptInputTextarea placeholder="Ask anything..." />
						<PromptInputFooter>
							<PromptInputTools>
								<PromptInputButton>
									<HiMiniPaperClip className="size-4" />
								</PromptInputButton>
								<PromptInputButton>
									<HiMiniAtSymbol className="size-4" />
								</PromptInputButton>
								<ModelPicker
									selectedModel={selectedModel}
									onSelectModel={setSelectedModel}
									open={modelSelectorOpen}
									onOpenChange={setModelSelectorOpen}
								/>
							</PromptInputTools>
							<div className="flex items-center gap-1">
								<ContextIndicator />
								<PromptInputSubmit
									status={isLoading ? "streaming" : undefined}
									onClick={isLoading ? handleStop : undefined}
								/>
							</div>
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		</div>
	);
}
