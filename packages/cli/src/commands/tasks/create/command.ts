import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Create a task",
	options: {
		title: string().required().desc("Task title"),
		description: string().desc("Task description"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Priority"),
		assignee: string().desc("Assignee user ID"),
	},
	run: async ({ ctx, options }) => {
		const result = await ctx.api.task.create.mutate({
			title: options.title,
			description: options.description ?? undefined,
			priority: options.priority,
			assigneeId: options.assignee ?? undefined,
		});

		const task = result.task;
		return {
			data: task,
			message: `Created task ${task?.slug}: ${task?.title}`,
		};
	},
});
