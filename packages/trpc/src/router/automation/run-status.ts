import type { SelectAutomationRun } from "@superset/db/schema";

export const TERMINAL_AUTOMATION_RUN_STATUSES = new Set<
	SelectAutomationRun["status"]
>(["completed", "failed", "skipped", "dispatch_failed", "skipped_offline"]);

export const ACTIVE_AUTOMATION_RUN_STATUSES = new Set<
	SelectAutomationRun["status"]
>(["queued", "dispatching", "running", "dispatched"]);

export function isTerminalAutomationRunStatus(
	status: SelectAutomationRun["status"],
): boolean {
	return TERMINAL_AUTOMATION_RUN_STATUSES.has(status);
}

export function isActiveAutomationRunStatus(
	status: SelectAutomationRun["status"],
): boolean {
	return ACTIVE_AUTOMATION_RUN_STATUSES.has(status);
}
