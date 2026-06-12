import type { SelectAutomationRun } from "@superset/db/schema";

type AutomationRunStatus = SelectAutomationRun["status"];

export interface AutomationRunStatusView {
	label: string;
	dotClassName: string;
	badgeClassName: string;
}

const STATUS_VIEW: Record<AutomationRunStatus, AutomationRunStatusView> = {
	queued: {
		label: "Queued",
		dotClassName: "bg-muted-foreground",
		badgeClassName: "border-muted-foreground/30 text-muted-foreground",
	},
	dispatching: {
		label: "Dispatching",
		dotClassName: "bg-amber-500",
		badgeClassName: "border-amber-500/40 text-amber-600",
	},
	running: {
		label: "Running",
		dotClassName: "bg-blue-500",
		badgeClassName: "border-blue-500/40 text-blue-600",
	},
	completed: {
		label: "Completed",
		dotClassName: "bg-emerald-500",
		badgeClassName: "border-emerald-500/40 text-emerald-600",
	},
	failed: {
		label: "Failed",
		dotClassName: "bg-red-500",
		badgeClassName: "border-red-500/40 text-red-600",
	},
	skipped: {
		label: "Skipped",
		dotClassName: "bg-zinc-400",
		badgeClassName: "border-zinc-400/40 text-muted-foreground",
	},
	dispatched: {
		label: "Dispatched",
		dotClassName: "bg-emerald-500",
		badgeClassName: "border-emerald-500/40 text-emerald-600",
	},
	skipped_offline: {
		label: "Skipped",
		dotClassName: "bg-zinc-400",
		badgeClassName: "border-zinc-400/40 text-muted-foreground",
	},
	dispatch_failed: {
		label: "Failed",
		dotClassName: "bg-red-500",
		badgeClassName: "border-red-500/40 text-red-600",
	},
};

export function getAutomationRunStatusView(
	status: AutomationRunStatus,
): AutomationRunStatusView {
	return STATUS_VIEW[status];
}

export function getAutomationRunError(run: SelectAutomationRun): string | null {
	return run.failureReason || run.error || null;
}

export function isAutomationRunTerminal(run: SelectAutomationRun): boolean {
	return (
		run.status === "completed" ||
		run.status === "failed" ||
		run.status === "skipped" ||
		run.status === "dispatch_failed" ||
		run.status === "skipped_offline"
	);
}

export function getAutomationRunSourceLabel(
	source: SelectAutomationRun["source"],
): string {
	return source === "schedule" ? "Scheduled" : "Manual";
}
