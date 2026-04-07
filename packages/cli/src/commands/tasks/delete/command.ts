import { CLIError, command, positional } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";

export default command({
	description: "Delete tasks",
	args: [positional("ids").required().variadic().desc("Task IDs or slugs")],
	run: async (opts) => {
		const api = opts.ctx.api as ApiClient;
		const ids = opts.args.ids as string[];

		for (const idOrSlug of ids) {
			// Try as slug first, then as UUID
			const task = await api.task.bySlug.query(idOrSlug);
			if (!task) {
				throw new CLIError(`Task not found: ${idOrSlug}`);
			}
			await api.task.delete.mutate(task.id);
		}

		return {
			data: { count: ids.length, ids },
			message:
				ids.length === 1
					? `Deleted task ${ids[0]}`
					: `Deleted ${ids.length} tasks`,
		};
	},
});
