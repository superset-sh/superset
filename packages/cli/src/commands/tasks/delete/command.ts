import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	requireOrganizationId,
	resolveTask,
	resolveTracker,
	trackerOption,
} from "../tracker";

export default command({
	description: "Delete tasks (Linear issues are archived)",
	args: [positional("ids").required().variadic().desc("Task IDs or slugs")],
	options: { tracker: trackerOption },
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const deleted: string[] = [];
		const archived: string[] = [];
		const tracker = await resolveTracker(ctx, options.tracker);
		const failed: { id: string; reason: string }[] = [];

		for (const idOrSlug of ids) {
			try {
				const resolved = await resolveTask(ctx, idOrSlug, tracker);
				if (resolved.tracker === "linear") {
					await ctx.api.integration.linear.archiveIssue.mutate({
						organizationId: requireOrganizationId(ctx),
						issueId: resolved.issueId,
					});
					archived.push(idOrSlug);
				} else {
					await ctx.api.task.delete.mutate(resolved.task.id);
					deleted.push(idOrSlug);
				}
			} catch (error) {
				failed.push({
					id: idOrSlug,
					reason: error instanceof Error ? error.message : "unknown error",
				});
			}
		}

		if (failed.length > 0) {
			const summary = `Removed ${deleted.length + archived.length}/${ids.length} (${deleted.length} deleted, ${archived.length} archived); ${failed.length} failed (${failed.map((f) => `${f.id}: ${f.reason}`).join("; ")})`;
			throw new CLIError(summary);
		}

		const message = [
			deleted.length > 0 &&
				(deleted.length === 1
					? `Deleted task ${deleted[0]}`
					: `Deleted ${deleted.length} tasks`),
			archived.length > 0 &&
				(archived.length === 1
					? `Archived Linear issue ${archived[0]}`
					: `Archived ${archived.length} Linear issues`),
		]
			.filter(Boolean)
			.join("; ");
		return { data: { deleted, archived, failed }, message };
	},
});
