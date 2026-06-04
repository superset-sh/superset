export const PLAN_TIERS = ["free", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** Subscription.status values considered "paying" for gating purposes. */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;
export type ActiveSubscriptionStatus =
	(typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export function isPaidPlan(plan: string | null | undefined): boolean {
	return plan != null && plan !== "free";
}

export function isActiveSubscriptionStatus(
	status: string | null | undefined,
): status is ActiveSubscriptionStatus {
	return status === "active" || status === "trialing";
}
