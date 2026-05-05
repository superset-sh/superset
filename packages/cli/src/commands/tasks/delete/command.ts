import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Delete tasks",
	args: [positional("ids").required().variadic().desc("Task IDs or slugs")],
	run: async ({ ctx, args }) => {
		const ids = args.ids as string[];
		const deleted: string[] = [];
		const failed: { id: string; reason: string }[] = [];

		for (const idOrSlug of ids) {
			try {
				const task = await ctx.api.task.byIdOrSlug.query(idOrSlug);
				if (!task) {
					failed.push({ id: idOrSlug, reason: "not found" });
					continue;
				}
				await ctx.api.task.delete.mutate(task.id);
				deleted.push(idOrSlug);
			} catch (error) {
				failed.push({
					id: idOrSlug,
					reason: error instanceof Error ? error.message : "unknown error",
				});
			}
		}

		if (failed.length > 0) {
			const summary = `Deleted ${deleted.length}/${ids.length}; ${failed.length} failed (${failed.map((f) => `${f.id}: ${f.reason}`).join("; ")})`;
			throw new CLIError(summary);
		}

		return {
			data: { deleted, failed },
			message:
				deleted.length === 1
					? `Deleted task ${deleted[0]}`
					: `Deleted ${deleted.length} tasks`,
		};
	},
});
