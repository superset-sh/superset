import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
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

type GroupFilter = Exclude<ChecksFilterValue, "all">;

const GROUP_ORDER: GroupFilter[] = ["running", "failed", "passed", "skipped"];

// Plain `i18n._` descriptors rather than `msg()`: this module is covered by
// bun tests, which run uncompiled source where the Lingui macros need babel.
function groupTitle(filter: GroupFilter): string {
	switch (filter) {
		case "running":
			return i18n._(
				msg({
					message: "In Progress",
				}),
			);
		case "failed":
			return i18n._(msg({ message: "Failed" }));
		case "passed":
			return i18n._(msg({ message: "Passed" }));
		case "skipped":
			return i18n._(msg({ message: "Skipped" }));
	}
}

function segmentLabel(filter: ChecksFilterValue): string {
	switch (filter) {
		case "all":
			return i18n._(msg({ message: "All" }));
		case "running":
			return i18n._(
				msg({
					message: "Running",
				}),
			);
		case "failed":
			return i18n._(msg({ message: "Failed" }));
		case "passed":
			return i18n._(msg({ message: "Passed" }));
		case "skipped":
			return i18n._(
				msg({
					message: "Skipped",
				}),
			);
	}
}

const CHECK_FILTER: Record<EffectiveCheck, GroupFilter> = {
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
		{
			value: "all" as ChecksFilterValue,
			label: segmentLabel("all"),
			count: counts.all,
		},
		...GROUP_ORDER.map((group) => ({
			value: group as ChecksFilterValue,
			label: segmentLabel(group),
			count: counts[group],
		})),
	].filter((option) => option.value === "all" || counts[option.value] > 0);

	// Checks settle while the sheet is open; the selected tab can stop existing.
	const active = options.some((option) => option.value === filter)
		? filter
		: ("all" as ChecksFilterValue);

	const groups = GROUP_ORDER.map((group) => ({
		filter: group,
		title: groupTitle(group),
		segment: segmentLabel(group),
		members: checks.filter(
			(check) => CHECK_FILTER[effectiveCheckStatus(check)] === group,
		),
	})).filter(
		(group) =>
			group.members.length > 0 && (active === "all" || active === group.filter),
	);

	return { counts, options, groups, tally, filter: active };
}
