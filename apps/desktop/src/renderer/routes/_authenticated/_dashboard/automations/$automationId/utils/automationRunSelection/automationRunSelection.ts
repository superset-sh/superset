import type { SelectAutomationRun } from "@superset/db/schema";

function timestamp(value: Date | string | null | undefined): number {
	if (!value) return 0;
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : 0;
}

function runFreshness(run: SelectAutomationRun): number {
	return Math.max(
		timestamp(run.updatedAt),
		timestamp(run.completedAt),
		timestamp(run.startedAt),
		timestamp(run.dispatchedAt),
		timestamp(run.createdAt),
	);
}

export function pickFreshestAutomationRun(
	liveRun: SelectAutomationRun | null,
	fetchedRun: SelectAutomationRun | null,
): SelectAutomationRun | null {
	if (!liveRun) return fetchedRun;
	if (!fetchedRun) return liveRun;
	return runFreshness(fetchedRun) >= runFreshness(liveRun)
		? fetchedRun
		: liveRun;
}

export function mergeSelectedAutomationRun(
	recentRuns: SelectAutomationRun[],
	selectedRun: SelectAutomationRun | null,
): SelectAutomationRun[] {
	if (!selectedRun) return recentRuns;
	const existingIndex = recentRuns.findIndex(
		(run) => run.id === selectedRun.id,
	);
	if (existingIndex === -1) return [selectedRun, ...recentRuns];
	return recentRuns.map((run, index) =>
		index === existingIndex
			? (pickFreshestAutomationRun(run, selectedRun) ?? run)
			: run,
	);
}
