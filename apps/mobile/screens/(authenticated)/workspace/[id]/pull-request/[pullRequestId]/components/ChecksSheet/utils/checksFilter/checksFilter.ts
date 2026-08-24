import {
	type EffectiveCheck,
	effectiveCheckStatus,
	tallyChecks,
} from "../../../../../../utils/pullRequest/checks";
import type { PullRequestCheck } from "../../../../../../utils/pullRequest/types";

export type ChecksFilterValue =
	| "all"
	| "running"
	| "failed"
	| "passed"
	| "skipped";

const GROUPS: {
	filter: Exclude<ChecksFilterValue, "all">;
	title: string;
	segment: string;
}[] = [
	{ filter: "running", title: "In Progress", segment: "Running" },
	{ filter: "failed", title: "Failed", segment: "Failed" },
	{ filter: "passed", title: "Passed", segment: "Passed" },
	{ filter: "skipped", title: "Skipped", segment: "Skipped" },
];

const CHECK_FILTER: Record<
	EffectiveCheck,
	Exclude<ChecksFilterValue, "all">
> = {
	failed: "failed",
	"needs-action": "failed",
	running: "running",
	passed: "passed",
	ignored: "skipped",
};

/** Segments to offer and groups to show; zero-count tabs are dropped, All never. */
export function checksFilterState(
	checks: PullRequestCheck[],
	filter: ChecksFilterValue,
) {
	const tally = tallyChecks(checks);
	const counts: Record<ChecksFilterValue, number> = {
		all: tally.total,
		running: tally.running,
		failed: tally.failed + tally.needsAction,
		passed: tally.passed,
		skipped: tally.ignored,
	};

	const options = [
		{ value: "all" as ChecksFilterValue, label: "All", count: counts.all },
		...GROUPS.map((group) => ({
			value: group.filter as ChecksFilterValue,
			label: group.segment,
			count: counts[group.filter],
		})),
	].filter((option) => option.value === "all" || counts[option.value] > 0);

	// Checks settle while the sheet is open; the selected tab can stop existing.
	const active = options.some((option) => option.value === filter)
		? filter
		: ("all" as ChecksFilterValue);

	const groups = GROUPS.map((group) => ({
		...group,
		members: checks.filter(
			(check) => CHECK_FILTER[effectiveCheckStatus(check)] === group.filter,
		),
	})).filter(
		(group) =>
			group.members.length > 0 && (active === "all" || active === group.filter),
	);

	return { counts, options, groups, tally, filter: active };
}
