import { CLIError, number, positional, string } from "@superset/cli-framework";
import { isValid, parseISO } from "date-fns";
import { command } from "../../../lib/command";

export default command({
	description: "Update a task",
	args: [positional("idOrSlug").required().desc("Task ID or slug")],
	options: {
		title: string().desc("Task title"),
		description: string().desc("Task description"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Priority"),
		assignee: string().desc("Assignee user ID"),
		statusId: string().desc("Status ID"),
		prUrl: string().desc("Linked PR URL"),
		estimate: number().int().min(1).desc("Story-point estimate"),
		dueDate: string().desc("Due date (ISO 8601)"),
		labels: string().desc("Comma-separated labels"),
	},
	run: async ({ ctx, args, options }) => {
		const idOrSlug = args.idOrSlug as string;
		const task = await ctx.api.task.byIdOrSlug.query(idOrSlug);
		if (!task) throw new CLIError(`Task not found: ${idOrSlug}`);

		let dueDate: Date | undefined;
		if (options.dueDate !== undefined) {
			const parsed = parseISO(options.dueDate);
			if (!isValid(parsed)) {
				throw new CLIError(
					`--due-date: invalid ISO 8601 date "${options.dueDate}"`,
				);
			}
			dueDate = parsed;
		}

		const labels =
			options.labels !== undefined
				? options.labels
						.split(",")
						.map((label) => label.trim())
						.filter(Boolean)
				: undefined;

		const result = await ctx.api.task.update.mutate({
			id: task.id,
			title: options.title ?? undefined,
			description: options.description ?? undefined,
			priority: options.priority ?? undefined,
			assigneeId: options.assignee ?? undefined,
			statusId: options.statusId ?? undefined,
			prUrl: options.prUrl ?? undefined,
			estimate: options.estimate ?? undefined,
			dueDate,
			labels,
		});

		return {
			data: result.task,
			message: `Updated task ${task.slug}`,
		};
	},
});
