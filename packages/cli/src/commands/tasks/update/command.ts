import { CLIError, command, positional, string } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";

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
		branch: string().desc("Git branch"),
	},

	run: async (opts) => {
		const api = opts.ctx.api as ApiClient;
		const slug = opts.args.idOrSlug as string;

		// Look up the task by slug
		const task = await api.task.bySlug.query(slug);
		if (!task) throw new CLIError(`Task not found: ${slug}`);

		const result = await api.task.update.mutate({
			id: task.id,
			title: opts.options.title ?? undefined,
			description: opts.options.description ?? undefined,
			priority: (opts.options.priority as any) ?? undefined,
			assigneeId: opts.options.assignee ?? undefined,
			branch: opts.options.branch ?? undefined,
		});

		return {
			data: result.task,
			message: `Updated task ${task.slug}`,
		};
	},
});
