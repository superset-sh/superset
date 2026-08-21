import { string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List pages in the organization",
	options: {
		workspace: string().desc(
			"Only pages published from this workspace (defaults to $SUPERSET_WORKSPACE_ID)",
		),
	},
	run: async ({ ctx, options }) => {
		const workspaceId = options.workspace ?? process.env.SUPERSET_WORKSPACE_ID;
		return await ctx.api.page.list.query(
			workspaceId ? { workspaceId } : undefined,
		);
	},
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				title: row.title,
				version: row.latestVersion ?? "-",
				visibility: row.visibility,
				url: row.url,
				id: row.id,
			})),
			["title", "version", "visibility", "url", "id"],
			["TITLE", "V", "VISIBILITY", "URL", "ID"],
			[30, 4, 10, 50, 36],
		),
});
