import type { TaskStatus } from "../StatusIndicator";

export const getStatusLabel = (status: TaskStatus): string => {
	const labels: Record<TaskStatus, string> = {
		planning: "Planning",
		working: "Working",
		"needs-feedback": "Needs Feedback",
		"ready-to-merge": "Ready to Merge",
		backlog: "Backlog",
		todo: "Todo",
		completed: "Completed",
		canceled: "Canceled",
	};
	return labels[status] || "";
};
