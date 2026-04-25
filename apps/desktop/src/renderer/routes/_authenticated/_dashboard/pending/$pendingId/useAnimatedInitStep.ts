import { useEffect, useState } from "react";
import {
	getStepIndex,
	INIT_STEP_ORDER,
	type WorkspaceInitStep,
} from "shared/types/workspace-init";

const STEP_HOLD_MS = 160;
const LEAD_IN_HOLD_MS = 60;
const READY_CATCH_UP_HOLD_MS = 60;

/**
 * Advances through `INIT_STEP_ORDER` at a readable pace. The first two keypad
 * beats are a v2 lead-in, so move through them quickly and leave the later
 * keys for the real worktree/register/opening states.
 *
 * v2's host-service can blow through its 5 steps in well under a poll interval
 * (the whole local-only flow is a handful of synchronous ops), so a raw
 * target-step would let the renderer see e.g. `pending → ready` in one hop —
 * instantly pressing all keypad keys with no visible progression.
 *
 * Returns a displayed step that walks forward until it catches up, so both
 * `KeypadLoader` and `StepProgress` get a visible beat per step. Navigation
 * must not wait on this hook; it is purely presentational.
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

		const nextIdx = displayedIdx + 1;
		const isLeadInStep = nextIdx <= getStepIndex("creating_worktree");
		const holdMs =
			targetStep === "ready"
				? READY_CATCH_UP_HOLD_MS
				: isLeadInStep
					? LEAD_IN_HOLD_MS
					: STEP_HOLD_MS;
		const timer = window.setTimeout(() => {
			const next = INIT_STEP_ORDER[nextIdx];
			if (next) setDisplayed(next);
		}, holdMs);
		return () => window.clearTimeout(timer);
	}, [targetStep, displayed, resetKey]);

	return displayed;
}
