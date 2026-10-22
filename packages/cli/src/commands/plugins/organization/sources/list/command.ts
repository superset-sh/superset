import { table } from "@superset/cli-framework";
import { command } from "../../../../../lib/command";

export default command({
	description: "List the repositories your organization's plugins sync from",
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["id", "repo", "ref", "path", "syncedAt", "syncError"],
			["ID", "REPO", "REF", "PATH", "SYNCED", "ERROR"],
			[36, 28, 12, 16, 24, 40],
		),
	run: async ({ ctx }) => {
		const sources = await ctx.api.plugins.organization.sources.list.query();
		return {
			data: sources,
			message: sources.length
				? `${sources.length} source${sources.length === 1 ? "" : "s"}.`
				: "No sources. Add one: superset plugins organization sources add <owner/repo>",
		};
	},
});
