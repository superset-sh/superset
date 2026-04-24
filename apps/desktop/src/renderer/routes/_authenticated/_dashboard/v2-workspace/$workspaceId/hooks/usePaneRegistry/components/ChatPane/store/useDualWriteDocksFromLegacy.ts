/**
 * Phase 4 dock bridge.
 *
 * Mirrors legacy `getDisplayState` fields (pendingApproval /
 * pendingQuestion / pendingPlanApproval) into the new chatStore.docks
 * so the new DocksStack can render them. Each poll tick patches any
 * changed slot.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §4.3.
 */

import type {
	ApprovalRequest,
	PlanApprovalRequest,
	QuestionRequest,
	TodoItem,
} from "@superset/chat/shared";
import { useEffect, useRef } from "react";
import { useChatStore } from "./chatStore";

export interface LegacyDockState {
	pendingApproval?: {
		toolCallId: string;
		toolName: string;
		args: unknown;
	} | null;
	pendingQuestion?: {
		questionId: string;
		question: string;
		options?: Array<{ label: string; description?: string }>;
		allowFreeText?: boolean;
	} | null;
	pendingPlanApproval?: {
		planId: string;
		markdown: string;
	} | null;
	todos?: TodoItem[];
}

export interface UseDualWriteDocksFromLegacyInput {
	sessionId: string | null;
	legacy: LegacyDockState | null;
}

interface DockFingerprint {
	sessionId: string;
	approvalId: string | null;
	approvalToolName: string | null;
	questionId: string | null;
	questionText: string | null;
	planId: string | null;
	planMarkdownLength: number | null;
	todosHash: string | null;
}

function fingerprint(
	sessionId: string,
	legacy: LegacyDockState | null,
): DockFingerprint {
	const approval = legacy?.pendingApproval ?? null;
	const question = legacy?.pendingQuestion ?? null;
	const plan = legacy?.pendingPlanApproval ?? null;
	const todos = legacy?.todos ?? null;
	return {
		sessionId,
		approvalId: approval?.toolCallId ?? null,
		approvalToolName: approval?.toolName ?? null,
		questionId: question?.questionId ?? null,
		questionText: question?.question ?? null,
		planId: plan?.planId ?? null,
		planMarkdownLength: plan?.markdown?.length ?? null,
		todosHash: todos
			? `${todos.length}:${todos.map((t) => `${t.id}:${t.status}`).join(",")}`
			: null,
	};
}

function same(a: DockFingerprint, b: DockFingerprint): boolean {
	return (
		a.sessionId === b.sessionId &&
		a.approvalId === b.approvalId &&
		a.approvalToolName === b.approvalToolName &&
		a.questionId === b.questionId &&
		a.questionText === b.questionText &&
		a.planId === b.planId &&
		a.planMarkdownLength === b.planMarkdownLength &&
		a.todosHash === b.todosHash
	);
}

export function useDualWriteDocksFromLegacy({
	sessionId,
	legacy,
}: UseDualWriteDocksFromLegacyInput): void {
	const setDocks = useChatStore((s) => s.setDocks);

	// Guard against writing identical dock content on every tRPC poll. The
	// legacy displayState is a fresh object each tick, so naively calling
	// setDocks triggers Zustand notifications every 250ms even when
	// nothing actually changed. Fingerprint-compare instead.
	const lastFingerprintRef = useRef<DockFingerprint | null>(null);

	useEffect(() => {
		if (!sessionId) return;

		const nextFingerprint = fingerprint(sessionId, legacy);
		const prev = lastFingerprintRef.current;
		if (prev && same(prev, nextFingerprint)) return;
		lastFingerprintRef.current = nextFingerprint;

		const approval: ApprovalRequest | null = legacy?.pendingApproval
			? {
					id: legacy.pendingApproval.toolCallId,
					toolCallID: legacy.pendingApproval.toolCallId,
					toolName: legacy.pendingApproval.toolName,
					args: legacy.pendingApproval.args,
				}
			: null;

		const question: QuestionRequest | null = legacy?.pendingQuestion
			? {
					id: legacy.pendingQuestion.questionId,
					question: legacy.pendingQuestion.question,
					options: legacy.pendingQuestion.options,
					allowFreeText: legacy.pendingQuestion.allowFreeText,
				}
			: null;

		const plan: PlanApprovalRequest | null = legacy?.pendingPlanApproval
			? {
					id: legacy.pendingPlanApproval.planId,
					planID: legacy.pendingPlanApproval.planId,
					markdown: legacy.pendingPlanApproval.markdown,
				}
			: null;

		setDocks(sessionId, {
			approval,
			question,
			plan,
			...(legacy?.todos ? { todos: legacy.todos } : {}),
		});
	}, [sessionId, legacy, setDocks]);
}
