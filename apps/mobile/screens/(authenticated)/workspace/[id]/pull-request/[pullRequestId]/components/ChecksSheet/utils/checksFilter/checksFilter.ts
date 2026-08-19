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

/** Segments to offer and groups to show; "Failed" is offered even at zero. */
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
	].filter(
		(option) =>
			option.value === "all" ||
			option.value === "failed" ||
			counts[option.value] > 0,
	);

	const groups = GROUPS.map((group) => ({
		...group,
		members: checks.filter(
			(check) => CHECK_FILTER[effectiveCheckStatus(check)] === group.filter,
		),
	})).filter(
		(group) =>
			group.members.length > 0 && (filter === "all" || filter === group.filter),
	);

	return { counts, options, groups, tally };
}
