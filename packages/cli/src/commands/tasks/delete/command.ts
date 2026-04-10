import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Delete tasks",
	args: [positional("ids").required().variadic().desc("Task IDs or slugs")],
	run: async ({ ctx, args }) => {
		// Required variadic positional — framework guarantees non-empty at runtime
		const ids = args.ids as string[];
		for (const idOrSlug of ids) {
			const task = await ctx.api.task.bySlug.query(idOrSlug);
			if (!task) throw new CLIError(`Task not found: ${idOrSlug}`);
			await ctx.api.task.delete.mutate(task.id);
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
