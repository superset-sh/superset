/**
 * Drain effect for the followup queue. When the session transitions to
 * idle AND the queue is not paused AND there's no blocking dock, pop
 * the head of the queue and submit it via the caller's onSubmit.
 */

import { useEffect } from "react";
import { useFollowupStore } from "../../../../store/followupStore";

export interface UseFollowupDrainInput {
	sessionId: string | null;
	/** True while the session is busy; drain only fires on idle. */
	isRunning: boolean;
	/** True if any blocking dock (approval/question/plan) is visible. */
	blockedByDock: boolean;
	/** Submit a prompt to the agent. */
	onSubmit: (prompt: string) => Promise<void> | void;
}

export function useFollowupDrain({
	sessionId,
	isRunning,
	blockedByDock,
	onSubmit,
}: UseFollowupDrainInput): void {
	useEffect(() => {
		if (!sessionId) return;
		if (isRunning || blockedByDock) return;
		const state = useFollowupStore.getState();
		if (state.isPaused(sessionId)) return;
		const queue = state.getQueue(sessionId);
		if (queue.length === 0) return;
		const head = state.popHead(sessionId);
		if (!head) return;
		void Promise.resolve(onSubmit(head.prompt));
	}, [sessionId, isRunning, blockedByDock, onSubmit]);
}
