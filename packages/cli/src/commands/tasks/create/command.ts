import { CLIError, number, string } from "@superset/cli-framework";
import { isValid, parseISO } from "date-fns";
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
		statusId: string().desc("Status ID"),
		estimate: number().int().min(1).desc("Story-point estimate"),
		dueDate: string().desc("Due date (ISO 8601)"),
		labels: string().desc("Comma-separated labels"),
	},
	run: async ({ ctx, options }) => {
		const labels = options.labels
			? options.labels
					.split(",")
					.map((label) => label.trim())
					.filter(Boolean)
			: undefined;
		let dueDate: Date | undefined;
		if (options.dueDate) {
			const parsed = parseISO(options.dueDate);
			if (!isValid(parsed)) {
				throw new CLIError(
					`--due-date: invalid ISO 8601 date "${options.dueDate}"`,
				);
			}
			dueDate = parsed;
		}
		const result = await ctx.api.task.create.mutate({
			title: options.title,
			description: options.description ?? undefined,
			priority: options.priority,
			assigneeId: options.assignee ?? undefined,
			statusId: options.statusId ?? undefined,
			estimate: options.estimate ?? undefined,
			dueDate,
			labels,
		});

		const task = result.task;
		return {
			data: task,
			message: `Created task ${task?.slug}: ${task?.title}`,
		};
	},
});
