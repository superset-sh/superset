import type { PullRequestCheck } from "./types";

export type EffectiveCheck =
	| "passed"
	| "failed"
	| "running"
	| "needs-action"
	| "ignored";

/**
 * GitHub's status × conclusion grid collapsed to what a person cares about.
 * `neutral` is a pass and `skipped`/`cancelled` count as neither — getting this
 * wrong paints green pipelines red.
 */
export function effectiveCheckStatus(check: PullRequestCheck): EffectiveCheck {
	if (check.status !== "COMPLETED") return "running";
	switch (check.conclusion) {
		case "SUCCESS":
		case "NEUTRAL":
			return "passed";
		case "SKIPPED":
		case "CANCELLED":
			return "ignored";
		case "ACTION_REQUIRED":
			return "needs-action";
		case "STALE":
		case null:
			return "running";
		default:
			return "failed";
	}
}

export interface ChecksTally {
	passed: number;
	failed: number;
	running: number;
	needsAction: number;
	/** Skipped and cancelled runs: they ran to no verdict, so they neither pass nor fail. */
	ignored: number;
	/** Counts ignored runs too, so the All tab can expose skipped runs separately. */
	total: number;
	failing: PullRequestCheck[];
}

export function tallyChecks(checks: PullRequestCheck[]): ChecksTally {
	const tally: ChecksTally = {
		passed: 0,
		failed: 0,
		running: 0,
		needsAction: 0,
		ignored: 0,
		total: 0,
		failing: [],
	};
	for (const check of checks) {
		const status = effectiveCheckStatus(check);
		tally.total += 1;
		if (status === "ignored") {
			tally.ignored += 1;
			continue;
		}
		if (status === "passed") tally.passed += 1;
		else if (status === "running") tally.running += 1;
		else {
			if (status === "needs-action") tally.needsAction += 1;
			else tally.failed += 1;
			tally.failing.push(check);
		}
	}
	return tally;
}
