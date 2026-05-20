interface TaskLike {
	id: string;
	statusId: string;
}

interface ColumnOverData {
	type: "column";
	statusId: string;
}

interface TaskOverData {
	type: "task";
	task: TaskLike;
}

export type BoardOverData = ColumnOverData | TaskOverData | null | undefined;

export type BoardDropTarget =
	| { type: "noop" }
	| { type: "moveToStatus"; taskId: string; targetStatusId: string };

// Determines what should happen when a task card is dropped on the Kanban board.
//
// Known limitation tracked by issue #4714: when a task is dropped on another
// task (or column) in the same status, the result is `noop` — there is no
// within-column reorder, because tasks have no positional column field today.
export function getBoardDropTarget(args: {
	activeTaskId: string;
	tasks: TaskLike[];
	overData: BoardOverData;
}): BoardDropTarget {
	const { activeTaskId, tasks, overData } = args;

	if (!overData) return { type: "noop" };

	let targetStatusId: string | null = null;
	if (overData.type === "column") {
		targetStatusId = overData.statusId;
	} else if (overData.type === "task") {
		targetStatusId = overData.task.statusId;
	}

	if (!targetStatusId) return { type: "noop" };

	const task = tasks.find((t) => t.id === activeTaskId);
	if (!task) return { type: "noop" };
	if (task.statusId === targetStatusId) return { type: "noop" };

	return {
		type: "moveToStatus",
		taskId: activeTaskId,
		targetStatusId,
	};
}
