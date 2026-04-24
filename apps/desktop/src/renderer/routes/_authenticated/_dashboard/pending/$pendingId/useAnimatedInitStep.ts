import { useEffect, useState } from "react";
import {
	getStepIndex,
	INIT_STEP_ORDER,
	type WorkspaceInitStep,
} from "shared/types/workspace-init";

const STEP_HOLD_MS = 400;

/**
 * Advances through `INIT_STEP_ORDER` at most one step per `STEP_HOLD_MS`.
 *
 * v2's host-service can blow through its 5 steps in well under a poll interval
 * (the whole local-only flow is a handful of synchronous ops), so a raw
 * target-step would let the renderer see e.g. `pending → ready` in one hop —
 * instantly pressing all keypad keys with no visible progression.
 *
 * Returns a displayed step that walks forward until it catches up, so both
 * `KeypadLoader` and `StepProgress` get a visible beat per step. When the
 * backend genuinely takes longer than the hold, displayed stays pinned at
 * target (the hook adds no artificial latency to slow flows).
 */
export function useAnimatedInitStep(
	targetStep: WorkspaceInitStep,
	resetKey?: string,
): WorkspaceInitStep {
	const [state, setState] = useState<{
		displayed: WorkspaceInitStep;
		resetKey: string | undefined;
	}>({ displayed: "pending", resetKey });

	const displayed = state.resetKey === resetKey ? state.displayed : "pending";

	useEffect(() => {
		const targetIdx = getStepIndex(targetStep);
		const displayedIdx = getStepIndex(displayed);

		const setDisplayed = (next: WorkspaceInitStep) => {
			setState({ displayed: next, resetKey });
		};

		if (targetStep === "failed") {
			setDisplayed("failed");
			return;
		}
		if (displayedIdx < 0) {
			setDisplayed("pending");
			return;
		}
		if (displayedIdx >= targetIdx) return;

		const timer = window.setTimeout(() => {
			const nextIdx = displayedIdx + 1;
			const next = INIT_STEP_ORDER[nextIdx];
			if (next) setDisplayed(next);
		}, STEP_HOLD_MS);
		return () => window.clearTimeout(timer);
	}, [targetStep, displayed, resetKey]);

	return displayed;
}
