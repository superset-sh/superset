import type { PlanTier } from "@superset/shared/billing";

export const SEATS_FEATURE_ID = "seats";
export const PRO_MONTHLY_PLAN_ID = "pro";
export const PRO_ANNUAL_PLAN_ID = "pro_annual";

const PRO_PLAN_IDS = new Set([PRO_MONTHLY_PLAN_ID, PRO_ANNUAL_PLAN_ID]);

export function autumnPlanIdFor(annual: boolean): string {
	return annual ? PRO_ANNUAL_PLAN_ID : PRO_MONTHLY_PLAN_ID;
}

export function isPaidAutumnPlan(planId: string): boolean {
	return PRO_PLAN_IDS.has(planId) || planId.startsWith("enterprise");
}

export function planFromStripePrice(
	priceId: string | undefined,
	prices: { pro: string[]; enterprise: string[] },
): Exclude<PlanTier, "free"> | null {
	if (!priceId) return null;
	if (prices.enterprise.includes(priceId)) return "enterprise";
	if (prices.pro.includes(priceId)) return "pro";
	return null;
}

export function legacyPlanName(
	autumnPlanId: string,
): Exclude<PlanTier, "free"> {
	return autumnPlanId.startsWith("enterprise") ? "enterprise" : "pro";
}
