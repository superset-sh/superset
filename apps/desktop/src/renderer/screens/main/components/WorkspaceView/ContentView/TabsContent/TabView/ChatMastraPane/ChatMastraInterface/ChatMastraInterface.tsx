import { chatServiceTrpc } from "@superset/chat/client";
import { useMastraChatDisplay } from "@superset/chat-mastra/client";
import {
	type PromptInputMessage,
	PromptInputProvider,
} from "@superset/ui/ai-elements/prompt-input";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus, UIMessage } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { ChatInputFooter } from "../../ChatPane/ChatInterface/components/ChatInputFooter";
import { McpOverviewPicker } from "../../ChatPane/ChatInterface/components/McpOverviewPicker";
import { MessageList } from "../../ChatPane/ChatInterface/components/MessageList";
import { useSlashCommandExecutor } from "../../ChatPane/ChatInterface/hooks/useSlashCommandExecutor";
import type { SlashCommand } from "../../ChatPane/ChatInterface/hooks/useSlashCommands";
import type {
	McpOverviewPayload,
	ModelOption,
	PermissionMode,
} from "../../ChatPane/ChatInterface/types";
import { McpActionPanels } from "./components/McpActionPanels";
import type { ChatMastraInterfaceProps } from "./types";
import { toActiveToolEntries } from "./utils/active-tools";
import { messagePartsFromDisplay } from "./utils/message-parts-from-display";

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

export function ChatMastraInterface({
	sessionId,
	organizationId,
	workspaceId,
	cwd,
	onStartFreshSession,
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
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [mcpOverview, setMcpOverview] = useState<McpOverviewPayload | null>(
		null,
	);
	const [mcpOverviewOpen, setMcpOverviewOpen] = useState(false);
	const [isMcpOverviewLoading, setIsMcpOverviewLoading] = useState(false);
	const [isApprovalPending, setIsApprovalPending] = useState(false);
	const [isQuestionPending, setIsQuestionPending] = useState(false);
	const [isPlanPending, setIsPlanPending] = useState(false);
	const [questionDraft, setQuestionDraft] = useState("");
	const [planFeedback, setPlanFeedback] = useState("");
	const currentSessionRef = useRef<string | null>(null);
	const chatServiceTrpcUtils = chatServiceTrpc.useUtils();

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

	const clearRuntimeError = useCallback(() => {
		setRuntimeError(null);
	}, []);

	const setRuntimeErrorMessage = useCallback((message: string) => {
		setRuntimeError(message);
	}, []);

	const canAbort = Boolean(chat.displayState?.isRunning);

	const { resolveSlashCommandInput } = useSlashCommandExecutor({
		cwd,
		availableModels,
		canAbort,
		onStartFreshSession,
		onStopActiveResponse: () => {
			void chat.control({ action: "stop" });
		},
		onSelectModel: setSelectedModel,
		onOpenModelPicker: () => setModelSelectorOpen(true),
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onShowMcpOverview: (overview) => {
			setMcpOverview(overview);
			setMcpOverviewOpen(true);
		},
	});

	const pendingApproval = chat.displayState?.pendingApproval;
	const pendingQuestion = chat.displayState?.pendingQuestion;
	const pendingPlanApproval = chat.displayState?.pendingPlanApproval;
	const activeToolEntries = useMemo(
		() => toActiveToolEntries(chat.displayState?.activeTools),
		[chat.displayState?.activeTools],
	);

	const pendingQuestionId = pendingQuestion?.questionId ?? null;
	const pendingPlanId = pendingPlanApproval?.planId ?? null;

	useEffect(() => {
		if (currentSessionRef.current === sessionId) return;
		currentSessionRef.current = sessionId;
		setMessages([]);
		setSubmitStatus(undefined);
		setRuntimeError(null);
		setMcpOverview(null);
		setMcpOverviewOpen(false);
		setQuestionDraft("");
		setPlanFeedback("");
	}, [sessionId]);

	useEffect(() => {
		if (pendingQuestionId === null) return;
		setQuestionDraft("");
	}, [pendingQuestionId]);

	useEffect(() => {
		if (pendingPlanId === null) return;
		setPlanFeedback("");
	}, [pendingPlanId]);

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

		const nextMessage: UIMessage = {
			id: currentMessage.id,
			role: currentMessage.role,
			parts: messagePartsFromDisplay(currentMessage),
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
		(
			messageId: string,
			text: string,
			files: Array<{ url: string; mediaType: string; filename?: string }>,
		) => {
			const fileParts = files.map((file) => ({
				type: "file" as const,
				url: file.url,
				mediaType: file.mediaType,
				filename: file.filename,
			}));

			const next: UIMessage = {
				id: messageId,
				role: "user",
				parts: [
					...(text ? [{ type: "text" as const, text }] : []),
					...fileParts,
				],
			};

			setMessages((prev) => [...prev, next]);
		},
		[],
	);

	const handleSend = useCallback(
		async (message: PromptInputMessage) => {
			if (!sessionId) return;
			let text = message.text.trim();
			const files = (message.files ?? []).map((file) => ({
				url: file.url,
				mediaType: file.mediaType,
				filename: file.filename,
			}));

			const slashCommandResult = await resolveSlashCommandInput(text);
			if (slashCommandResult.handled) {
				return;
			}
			text = slashCommandResult.nextText.trim();
			if (!text && files.length === 0) return;

			const messageId = crypto.randomUUID();
			appendUserMessage(messageId, text, files);
			setSubmitStatus("submitted");
			clearRuntimeError();

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
			resolveSlashCommandInput,
			sessionId,
			thinkingEnabled,
			clearRuntimeError,
		],
	);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			clearRuntimeError();
			await chat.control({ action: "stop" });
		},
		[chat, clearRuntimeError],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			void handleSend({ text: `/${command.name}`, files: [] });
		},
		[handleSend],
	);

	const handleAnswer = useCallback(
		async (_toolCallId: string, answers: Record<string, string>) => {
			const currentPendingQuestion = chat.displayState?.pendingQuestion;
			if (!currentPendingQuestion) return;
			const firstAnswer = Object.values(answers)[0];
			if (!firstAnswer) return;
			clearRuntimeError();
			await chat.respondToQuestion({
				questionId: currentPendingQuestion.questionId,
				answer: firstAnswer,
			});
		},
		[chat, clearRuntimeError],
	);

	const handleOpenMcpOverview = useCallback(async () => {
		if (!cwd) {
			setRuntimeErrorMessage("Workspace path is missing");
			return;
		}
		setIsMcpOverviewLoading(true);
		try {
			const overview =
				await chatServiceTrpcUtils.workspace.getMcpOverview.fetch({
					cwd,
				});
			clearRuntimeError();
			setMcpOverview(overview);
			setMcpOverviewOpen(true);
		} catch {
			setRuntimeErrorMessage("Failed to load MCP settings");
		} finally {
			setIsMcpOverviewLoading(false);
		}
	}, [
		chatServiceTrpcUtils.workspace.getMcpOverview,
		clearRuntimeError,
		cwd,
		setRuntimeErrorMessage,
	]);

	const submitApprovalDecision = useCallback(
		async (decision: "approve" | "deny") => {
			if (!pendingApproval) return;
			setIsApprovalPending(true);
			clearRuntimeError();
			try {
				await chat.respondToApproval({
					decision,
					toolCallId: pendingApproval.toolCallId || undefined,
				});
			} catch (error) {
				setRuntimeErrorMessage(
					error instanceof Error
						? error.message
						: "Failed to submit approval response",
				);
			} finally {
				setIsApprovalPending(false);
			}
		},
		[chat, pendingApproval, clearRuntimeError, setRuntimeErrorMessage],
	);

	const submitQuestionAnswer = useCallback(
		async (answer: string) => {
			if (!pendingQuestion) return;
			const trimmed = answer.trim();
			if (!trimmed) return;
			setIsQuestionPending(true);
			clearRuntimeError();
			try {
				await chat.respondToQuestion({
					questionId: pendingQuestion.questionId,
					answer: trimmed,
				});
				setQuestionDraft("");
			} catch (error) {
				setRuntimeErrorMessage(
					error instanceof Error ? error.message : "Failed to answer question",
				);
			} finally {
				setIsQuestionPending(false);
			}
		},
		[chat, pendingQuestion, clearRuntimeError, setRuntimeErrorMessage],
	);

	const submitPlanDecision = useCallback(
		async (action: "accept" | "reject" | "revise") => {
			if (!pendingPlanApproval) return;
			setIsPlanPending(true);
			clearRuntimeError();
			try {
				await chat.respondToPlan({
					planId: pendingPlanApproval.planId,
					action,
					feedback: planFeedback.trim() || undefined,
				});
			} catch (error) {
				setRuntimeErrorMessage(
					error instanceof Error
						? error.message
						: "Failed to submit plan response",
				);
			} finally {
				setIsPlanPending(false);
			}
		},
		[
			chat,
			pendingPlanApproval,
			planFeedback,
			clearRuntimeError,
			setRuntimeErrorMessage,
		],
	);

	const errorMessage =
		runtimeError ?? toErrorMessage(chat.error) ?? chat.reason;
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
				<McpActionPanels
					pendingApproval={pendingApproval}
					pendingQuestion={pendingQuestion}
					pendingPlanApproval={pendingPlanApproval}
					activeToolEntries={activeToolEntries}
					isApprovalPending={isApprovalPending}
					isQuestionPending={isQuestionPending}
					isPlanPending={isPlanPending}
					questionDraft={questionDraft}
					planFeedback={planFeedback}
					onQuestionDraftChange={setQuestionDraft}
					onPlanFeedbackChange={setPlanFeedback}
					onApprove={() => {
						void submitApprovalDecision("approve");
					}}
					onDeny={() => {
						void submitApprovalDecision("deny");
					}}
					onSubmitQuestion={(answer) => {
						void submitQuestionAnswer(answer);
					}}
					onAcceptPlan={() => {
						void submitPlanDecision("accept");
					}}
					onRejectPlan={() => {
						void submitPlanDecision("reject");
					}}
					onRevisePlan={() => {
						void submitPlanDecision("revise");
					}}
				/>
				<div className="mx-auto flex w-full max-w-[680px] justify-end px-4 pb-2">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							void handleOpenMcpOverview();
						}}
						disabled={isMcpOverviewLoading}
					>
						{isMcpOverviewLoading ? "Loading MCP..." : "MCP Servers"}
					</Button>
				</div>
				<McpOverviewPicker
					overview={mcpOverview}
					open={mcpOverviewOpen}
					onOpenChange={setMcpOverviewOpen}
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
