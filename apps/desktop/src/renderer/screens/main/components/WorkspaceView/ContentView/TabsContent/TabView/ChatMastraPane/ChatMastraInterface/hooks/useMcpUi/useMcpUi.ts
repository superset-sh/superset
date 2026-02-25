import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import { useCallback, useEffect, useState } from "react";
import type { McpOverviewPayload } from "../../../../ChatPane/ChatInterface/types";

type DisplayState = NonNullable<UseMastraChatDisplayReturn["displayState"]>;

export interface UseMcpUiOptions {
	chat: UseMastraChatDisplayReturn;
	cwd: string;
	loadOverview: (cwd: string) => Promise<McpOverviewPayload>;
	onSetErrorMessage: (message: string) => void;
	onClearError: () => void;
}

export interface UseMcpUiReturn {
	overview: McpOverviewPayload | null;
	overviewOpen: boolean;
	isOverviewLoading: boolean;
	showOverview: (overview: McpOverviewPayload) => void;
	setOverviewOpen: (open: boolean) => void;
	openOverview: () => Promise<void>;
	refreshOverview: () => Promise<void>;
	resetUi: () => void;
	pendingApproval: DisplayState["pendingApproval"] | null | undefined;
	pendingQuestion: DisplayState["pendingQuestion"] | null | undefined;
	pendingPlanApproval: DisplayState["pendingPlanApproval"] | null | undefined;
	isApprovalPending: boolean;
	isQuestionPending: boolean;
	isPlanPending: boolean;
	questionDraft: string;
	planFeedback: string;
	setQuestionDraft: (value: string) => void;
	setPlanFeedback: (value: string) => void;
	submitApprovalDecision: (decision: "approve" | "deny") => Promise<void>;
	submitQuestionAnswer: (answer: string) => Promise<void>;
	submitPlanDecision: (action: "accept" | "reject" | "revise") => Promise<void>;
}

export function useMcpUi({
	chat,
	cwd,
	loadOverview,
	onSetErrorMessage,
	onClearError,
}: UseMcpUiOptions): UseMcpUiReturn {
	const [overview, setOverview] = useState<McpOverviewPayload | null>(null);
	const [overviewOpen, setOverviewOpen] = useState(false);
	const [isOverviewLoading, setIsOverviewLoading] = useState(false);
	const [isApprovalPending, setIsApprovalPending] = useState(false);
	const [isQuestionPending, setIsQuestionPending] = useState(false);
	const [isPlanPending, setIsPlanPending] = useState(false);
	const [questionDraft, setQuestionDraftState] = useState("");
	const [planFeedback, setPlanFeedbackState] = useState("");

	const pendingApproval = chat.displayState?.pendingApproval;
	const pendingQuestion = chat.displayState?.pendingQuestion;
	const pendingPlanApproval = chat.displayState?.pendingPlanApproval;

	const resetUi = useCallback(() => {
		setOverview(null);
		setOverviewOpen(false);
		setQuestionDraftState("");
		setPlanFeedbackState("");
	}, []);

	useEffect(() => {
		if (!pendingQuestion?.questionId) return;
		setQuestionDraftState("");
	}, [pendingQuestion?.questionId]);

	useEffect(() => {
		if (!pendingPlanApproval?.planId) return;
		setPlanFeedbackState("");
	}, [pendingPlanApproval?.planId]);

	const showOverview = useCallback((nextOverview: McpOverviewPayload) => {
		setOverview(nextOverview);
		setOverviewOpen(true);
	}, []);

	const openOverview = useCallback(async () => {
		if (!cwd) {
			onSetErrorMessage("Workspace path is missing");
			return;
		}
		setIsOverviewLoading(true);
		try {
			const nextOverview = await loadOverview(cwd);
			onClearError();
			setOverview(nextOverview);
			setOverviewOpen(true);
		} catch {
			onSetErrorMessage("Failed to load MCP settings");
		} finally {
			setIsOverviewLoading(false);
		}
	}, [cwd, loadOverview, onClearError, onSetErrorMessage]);

	const refreshOverview = useCallback(async () => {
		if (!cwd) return;
		try {
			const nextOverview = await loadOverview(cwd);
			setOverview(nextOverview);
		} catch {
			// keep existing overview when background refresh fails
		}
	}, [cwd, loadOverview]);

	const submitApprovalDecision = useCallback(
		async (decision: "approve" | "deny") => {
			if (!pendingApproval) return;
			setIsApprovalPending(true);
			onClearError();
			try {
				await chat.respondToApproval({
					decision,
					toolCallId: pendingApproval.toolCallId || undefined,
				});
			} catch (error) {
				onSetErrorMessage(
					error instanceof Error
						? error.message
						: "Failed to submit approval response",
				);
			} finally {
				setIsApprovalPending(false);
			}
		},
		[chat, onClearError, onSetErrorMessage, pendingApproval],
	);

	const submitQuestionAnswer = useCallback(
		async (answer: string) => {
			if (!pendingQuestion) return;
			const trimmed = answer.trim();
			if (!trimmed) return;
			setIsQuestionPending(true);
			onClearError();
			try {
				await chat.respondToQuestion({
					questionId: pendingQuestion.questionId,
					answer: trimmed,
				});
				setQuestionDraftState("");
			} catch (error) {
				onSetErrorMessage(
					error instanceof Error ? error.message : "Failed to answer question",
				);
			} finally {
				setIsQuestionPending(false);
			}
		},
		[chat, onClearError, onSetErrorMessage, pendingQuestion],
	);

	const submitPlanDecision = useCallback(
		async (action: "accept" | "reject" | "revise") => {
			if (!pendingPlanApproval) return;
			setIsPlanPending(true);
			onClearError();
			try {
				await chat.respondToPlan({
					planId: pendingPlanApproval.planId,
					action,
					feedback: planFeedback.trim() || undefined,
				});
			} catch (error) {
				onSetErrorMessage(
					error instanceof Error
						? error.message
						: "Failed to submit plan response",
				);
			} finally {
				setIsPlanPending(false);
			}
		},
		[chat, onClearError, onSetErrorMessage, pendingPlanApproval, planFeedback],
	);

	return {
		overview,
		overviewOpen,
		isOverviewLoading,
		showOverview,
		setOverviewOpen,
		openOverview,
		refreshOverview,
		resetUi,
		pendingApproval,
		pendingQuestion,
		pendingPlanApproval,
		isApprovalPending,
		isQuestionPending,
		isPlanPending,
		questionDraft,
		planFeedback,
		setQuestionDraft: setQuestionDraftState,
		setPlanFeedback: setPlanFeedbackState,
		submitApprovalDecision,
		submitQuestionAnswer,
		submitPlanDecision,
	};
}
