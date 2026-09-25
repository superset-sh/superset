import type { ChecksTally } from "../../../../../../../../utils/pullRequest";

export type ChecksRowMode = "failures" | "ring" | "settled";

/**
 * Failures outrank the ring: a red check is news even while others still run.
 * The ring is for in-flight-and-so-far-fine only, and "settled" covers both
 * all-passed and all-skipped.
 */
export function checksRowMode(tally: ChecksTally): ChecksRowMode {
	if (tally.failing.length > 0) return "failures";
	if (tally.running > 0) return "ring";
	return "settled";
}
