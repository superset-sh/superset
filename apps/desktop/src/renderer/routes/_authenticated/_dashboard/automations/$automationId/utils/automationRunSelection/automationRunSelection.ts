import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";

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

function isTerminalStatus(status: SelectAutomationRun["status"]): boolean {
	return (
		status === "completed" ||
		status === "failed" ||
		status === "skipped" ||
		status === "dispatch_failed" ||
		status === "skipped_offline"
	);
}

export function createOptimisticAutomationRun(args: {
	runId: string;
	automation: Pick<SelectAutomation, "id" | "organizationId" | "name">;
	status: SelectAutomationRun["status"];
	error?: string | null;
	now?: Date;
}): SelectAutomationRun {
	const now = args.now ?? new Date();
	const isRunning = args.status === "running" || args.status === "dispatched";
	const isTerminal = isTerminalStatus(args.status);

	return {
		id: args.runId,
		automationId: args.automation.id,
		organizationId: args.automation.organizationId,
		title: args.automation.name,
		source: "manual",
		scheduledFor: now,
		hostId: null,
		v2WorkspaceId: null,
		sessionKind: null,
		chatSessionId: null,
		terminalSessionId: null,
		status: args.status,
		error: args.error ?? null,
		failureReason: args.error ?? null,
		resultMarkdown: null,
		resultJson: null,
		resultSummary: null,
		resultSource: isTerminal ? "system" : null,
		terminalExitCode: null,
		startedAt: isRunning ? now : null,
		completedAt: isTerminal ? now : null,
		dispatchedAt: isRunning ? now : null,
		createdAt: now,
		updatedAt: now,
	};
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

export function mergeAutomationRuns(
	liveRuns: SelectAutomationRun[],
	fetchedRuns: SelectAutomationRun[],
): SelectAutomationRun[] {
	const byId = new Map<string, SelectAutomationRun>();

	for (const run of liveRuns) {
		byId.set(run.id, run);
	}
	for (const run of fetchedRuns) {
		byId.set(
			run.id,
			pickFreshestAutomationRun(byId.get(run.id) ?? null, run) ?? run,
		);
	}

	return Array.from(byId.values()).sort(
		(a, b) => timestamp(b.createdAt) - timestamp(a.createdAt),
	);
}
