import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";

/**
 * Statuses a task may move to. Plain's statuses are provider-scoped: they
 * apply only to tasks synced from Plain, and Plain tasks can't move onto the
 * shared (default/Linear) statuses. Otherwise a task lands on a status its
 * source tab filters out and disappears from the board.
 */
export function statusesForTask(
	statuses: SelectTaskStatus[],
	task: Pick<SelectTask, "externalProvider">,
): SelectTaskStatus[] {
	return statuses.filter((status) =>
		task.externalProvider === "plain"
			? status.externalProvider === "plain"
			: status.externalProvider !== "plain",
	);
}
