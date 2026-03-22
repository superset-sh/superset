interface TaskEchoSnapshot {
	lastSyncedAt: Date | null;
	title: string;
	description: string | null;
	statusId: string;
	priority: string;
	assigneeId: string | null;
	assigneeExternalId: string | null;
	estimate: number | null;
	dueDate: Date | null;
}

interface IncomingTaskData {
	title: string;
	description: string | null;
	statusId: string;
	priority: string;
	assigneeId: string | null;
	assigneeExternalId: string | null;
	estimate: number | null;
	dueDate: Date | null;
}

function normalizeDateOnly(value: Date | null): string | null {
	return value ? value.toISOString().slice(0, 10) : null;
}

export function shouldSkipTaskEcho({
	existingTask,
	incomingTaskData,
	now = Date.now(),
	echoWindowMs = 10_000,
}: {
	existingTask: TaskEchoSnapshot;
	incomingTaskData: IncomingTaskData;
	now?: number;
	echoWindowMs?: number;
}): boolean {
	if (!existingTask.lastSyncedAt) {
		return false;
	}

	if (now - existingTask.lastSyncedAt.getTime() >= echoWindowMs) {
		return false;
	}

	return (
		existingTask.title === incomingTaskData.title &&
		(existingTask.description ?? null) ===
			(incomingTaskData.description ?? null) &&
		existingTask.statusId === incomingTaskData.statusId &&
		existingTask.priority === incomingTaskData.priority &&
		existingTask.assigneeId === incomingTaskData.assigneeId &&
		existingTask.assigneeExternalId === incomingTaskData.assigneeExternalId &&
		existingTask.estimate === incomingTaskData.estimate &&
		normalizeDateOnly(existingTask.dueDate) ===
			normalizeDateOnly(incomingTaskData.dueDate)
	);
}
