export const PLAN_TIERS = ["free", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/**
 * Subscription.status values considered "paying" for gating purposes.
 *
 * `past_due` counts. Stripe retries a failed payment for ~14 days before giving
 * up, and duplicating that window here would mean two sources of truth that
 * drift the moment anyone edits the retry schedule in the dashboard. When Stripe
 * does give up it cancels the subscription, `customer.subscription.deleted`
 * lands, and the row moves to `canceled` — dropping out of this list on its own.
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = [
	"active",
	"trialing",
	"past_due",
] as const;
export type ActiveSubscriptionStatus =
	(typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export function isPaidPlan(plan: string | null | undefined): boolean {
	return plan != null && plan !== "free";
}

export function isActiveSubscriptionStatus(
	status: string | null | undefined,
): status is ActiveSubscriptionStatus {
	return ACTIVE_SUBSCRIPTION_STATUSES.some((candidate) => candidate === status);
}

/**
 * Access continues, but collection is failing and the subscription will be
 * canceled if it keeps failing. Surface this — never gate on it.
 */
export function isPaymentFailingStatus(
	status: string | null | undefined,
): boolean {
	return status === "past_due";
}

export const PLAN_RANK: Record<PlanTier, number> = {
	free: 0,
	pro: 1,
	enterprise: 2,
};

/**
 * The billing tier each trigger kind needs; kinds absent here are free
 * (schedule). One map for both sides of the product: the desktop Add Trigger
 * menu locks and badges off it, and the event dispatcher skips triggers above
 * the org's plan. Editing a saved above-tier trigger is deliberately still
 * allowed — a downgraded org maintains its automations, they just don't fire.
 */
const TRIGGER_KIND_REQUIRED_PLAN: Partial<
	Record<string, Exclude<PlanTier, "free">>
> = {
	github: "pro",
	slack: "pro",
	linear: "pro",
	sentry: "pro",
	notion: "pro",
	google_calendar: "pro",
	gmail: "pro",
	webhook: "pro",
	microsoft_teams: "enterprise",
};

/** The tier a trigger kind needs, or undefined when every plan has it. */
export function requiredPlanForTriggerKind(
	kind: string,
): Exclude<PlanTier, "free"> | undefined {
	return TRIGGER_KIND_REQUIRED_PLAN[kind];
}

/** Whether an org on this plan may run triggers of this kind. */
export function planAllowsTriggerKind(plan: PlanTier, kind: string): boolean {
	const required = TRIGGER_KIND_REQUIRED_PLAN[kind];
	return required === undefined || PLAN_RANK[plan] >= PLAN_RANK[required];
}
