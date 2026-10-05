import type { RouterOutputs } from "@superset/trpc";

/** Recently-viewed entries resolve by id or slug, so fetch a wide page. */
export const TASK_LOOKUP_LIMIT = 200;

type TaskListRow = RouterOutputs["task"]["listPage"]["items"][number];
type TaskStatusRow = RouterOutputs["task"]["statuses"]["list"][number];

export interface RecentTaskEntry {
	id: string;
	slug: string;
	externalProvider: string | null;
	externalKey: string | null;
	title: string;
	statusColor: string;
	statusType: string;
	statusProgress: number | null;
}

export function joinTasksWithStatuses(
	tasks: TaskListRow[],
	statuses: TaskStatusRow[],
): RecentTaskEntry[] {
	const statusById = new Map(statuses.map((status) => [status.id, status]));
	return tasks.flatMap(({ task }) => {
		const status = statusById.get(task.statusId);
		if (!status) return [];
		return [
			{
				id: task.id,
				slug: task.slug,
				externalProvider: task.externalProvider,
				externalKey: task.externalKey,
				title: task.title,
				statusColor: status.color,
				statusType: status.type,
				statusProgress: status.progressPercent,
			},
		];
	});
}
