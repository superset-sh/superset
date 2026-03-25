import type {
	SelectTask,
	SelectTaskStatus,
	SelectUser,
} from "@superset/db/schema";

type JoinedUser = Partial<SelectUser>;

export type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
	assignee: SelectUser | null;
};

type RawTaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
	assignee: JoinedUser | null | undefined;
};

// Newer TanStack DB join inference widens left-joined records to partials.
export function normalizeTaskWithStatus(
	task: RawTaskWithStatus,
): TaskWithStatus {
	return {
		...task,
		assignee:
			typeof task.assignee?.id === "string"
				? (task.assignee as SelectUser)
				: null,
	};
}
