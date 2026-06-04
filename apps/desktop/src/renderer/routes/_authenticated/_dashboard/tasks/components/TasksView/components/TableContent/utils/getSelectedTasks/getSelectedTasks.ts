import type { RowSelectionState } from "@tanstack/react-table";
import type { TaskWithStatus } from "../../../../hooks/useTasksData";

interface TaskRowLike {
	id: string;
	original: TaskWithStatus;
}

export function getSelectedTasks(
	rows: TaskRowLike[],
	rowSelection: RowSelectionState,
): TaskWithStatus[] {
	const selectedTasks = new Map<string, TaskWithStatus>();

	for (const row of rows) {
		if (!rowSelection[row.id]) {
			continue;
		}

		selectedTasks.set(row.original.id, row.original);
	}

	return [...selectedTasks.values()];
}
