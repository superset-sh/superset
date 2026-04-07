import { command, string } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";

export default command({
	description: "Create a task",
	options: {
		title: string().required().desc("Task title"),
		description: string().desc("Task description"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Priority"),
		assignee: string().desc("Assignee user ID"),
		branch: string().desc("Git branch"),
	},
	run: async (opts) => {
		const api = opts.ctx.api as ApiClient;
		const result = await api.task.createFromUi.mutate({
			title: opts.options.title,
			description: opts.options.description ?? undefined,
			priority: opts.options.priority as any,
			assigneeId: opts.options.assignee ?? undefined,
		});

		const task = result.task;
		return {
			data: task,
			message: `Created task ${task?.slug}: ${task?.title}`,
		};
	},
});
