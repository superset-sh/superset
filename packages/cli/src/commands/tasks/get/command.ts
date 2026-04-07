import { CLIError, command, positional } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";

export default command({
	description: "Get a task by ID or slug",
	args: [positional("idOrSlug").required().desc("Task ID or slug")],
	run: async (opts) => {
		const api = opts.ctx.api as ApiClient;
		const slug = opts.args.idOrSlug as string;
		const task = await api.task.bySlug.query(slug);

		if (!task) {
			throw new CLIError(`Task not found: ${slug}`);
		}

		return {
			data: task,
			message: [
				`${task.slug}: ${task.title}`,
				`Priority: ${task.priority ?? "—"}`,
				`Branch:   ${task.branch ?? "—"}`,
				task.description ? `\n${task.description}` : "",
			]
				.filter(Boolean)
				.join("\n"),
		};
	},
});
