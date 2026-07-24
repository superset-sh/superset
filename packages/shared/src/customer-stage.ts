/**
 * Derived company-stage tier from Superset adoption data. This measures
 * footprint *inside Superset* (users at the domain / members in the org) —
 * true firmographics (headcount, funding) come from enrichment and can
 * override this presentation-side.
 */

export const CUSTOMER_STAGE_TIERS = [
	"solo",
	"team",
	"scale",
	"enterprise",
] as const;
export type CustomerStage = (typeof CUSTOMER_STAGE_TIERS)[number];

export const STAGE_TEAM_MIN_USERS = 2;
export const STAGE_SCALE_MIN_USERS = 10;
export const STAGE_ENTERPRISE_MIN_USERS = 50;

export function stageFromUserCount(
	userCount: number,
	hasEnterprisePlan = false,
): CustomerStage {
	if (hasEnterprisePlan || userCount >= STAGE_ENTERPRISE_MIN_USERS) {
		return "enterprise";
	}
	if (userCount >= STAGE_SCALE_MIN_USERS) return "scale";
	if (userCount >= STAGE_TEAM_MIN_USERS) return "team";
	return "solo";
}
