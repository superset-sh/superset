import type { PlanTier } from "@superset/shared/billing";

export const SEATS_FEATURE_ID = "seats";
export const PRO_MONTHLY_PLAN_ID = "pro";
export const PRO_ANNUAL_PLAN_ID = "pro_annual";

const UNPAID_PLAN_IDS = new Set(["free", "hobby"]);

export function autumnPlanIdFor(annual: boolean): string {
	return annual ? PRO_ANNUAL_PLAN_ID : PRO_MONTHLY_PLAN_ID;
}

export function isPaidAutumnPlan(planId: string): boolean {
	return !UNPAID_PLAN_IDS.has(planId);
}

export function legacyPlanName(
	autumnPlanId: string,
): Exclude<PlanTier, "free"> {
	return autumnPlanId.startsWith("enterprise") ? "enterprise" : "pro";
}
