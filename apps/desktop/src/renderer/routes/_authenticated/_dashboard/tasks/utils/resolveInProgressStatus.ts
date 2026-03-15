import type { SelectTaskStatus } from "@superset/db/schema";

/**
 * Find the first task status with type "started" to use as the
 * "in progress" status when launching workspaces for tasks.
 */
export function resolveInProgressStatus(
	statuses: SelectTaskStatus[],
): SelectTaskStatus | null {
	return statuses.find((s) => s.type === "started") ?? null;
}

/**
 * Determine whether a task should have its status updated to "in progress"
 * when it is launched in a workspace.
 */
export function shouldTransitionToInProgress(
	currentStatusId: string,
	inProgressStatus: SelectTaskStatus | null,
): boolean {
	if (!inProgressStatus) return false;
	return currentStatusId !== inProgressStatus.id;
}
