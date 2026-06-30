/**
 * Pure visibility model for the pending-plan approval card.
 *
 * The plan approval comes from a polling snapshot, so the `planApproval` prop
 * can be dropped and re-emitted (even with the same `planId`) while the agent
 * reworks a plan the user just responded to. This state machine decides whether
 * the card should render, independent of that snapshot churn.
 */
export interface PlanApprovalVisibilityState {
	/** planId observed by the most recent prop change. */
	previousPlanId: string | null;
	/** planId the user has already responded to; must stay hidden. */
	acknowledgedPlanId: string | null;
}

export function createPlanApprovalVisibilityState(): PlanApprovalVisibilityState {
	return { previousPlanId: null, acknowledgedPlanId: null };
}

/**
 * Apply an incoming `planApproval` prop change (a new polling snapshot).
 * Returns the same reference when nothing changed so React can bail out.
 */
export function planApprovalChanged(
	state: PlanApprovalVisibilityState,
	planId: string | null,
): PlanApprovalVisibilityState {
	if (state.previousPlanId === planId) return state;
	// Preserve `acknowledgedPlanId`: a plan the user already responded to must
	// stay hidden even when the polling snapshot momentarily drops and re-adds
	// it while the agent reworks it (#5162). A genuinely new plan has a
	// different planId, so it is unaffected by this and renders normally.
	return {
		previousPlanId: planId,
		acknowledgedPlanId: state.acknowledgedPlanId,
	};
}

/** Record that the user responded (approve / request changes) to `planId`. */
export function planResponded(
	state: PlanApprovalVisibilityState,
	planId: string,
): PlanApprovalVisibilityState {
	return { ...state, acknowledgedPlanId: planId };
}

/** Whether the card should render for the given incoming `planId`. */
export function isPlanApprovalVisible(
	state: PlanApprovalVisibilityState,
	planId: string,
): boolean {
	if (!planId) return false;
	return state.acknowledgedPlanId !== planId;
}
