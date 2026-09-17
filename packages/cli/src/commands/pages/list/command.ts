import { number, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceId } from "../workspaceRef";

export default command({
	description: "List pages in the organization",
	options: {
		workspace: string().desc(
			"Only pages published from this workspace, by name or id (defaults to $SUPERSET_WORKSPACE_ID)",
		),
		limit: number().int().min(1).desc("Max pages to return (defaults to all)"),
	},
	run: async ({ ctx, options }) => {
		const workspace = options.workspace ?? process.env.SUPERSET_WORKSPACE_ID;
		const workspaceId = workspace
			? await resolveWorkspaceId({
					value: workspace,
					organizationId: ctx.config.organizationId,
					userJwt: ctx.bearer,
					api: ctx.api,
				})
			: undefined;
		return await ctx.api.page.list.query({
			workspaceId,
			limit: options.limit ?? undefined,
		});
	},
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				title: row.title,
				version: row.latestVersion,
				visibility: row.visibility,
				url: row.url,
				id: row.id,
			})),
			["title", "version", "visibility", "url", "id"],
			["TITLE", "V", "VISIBILITY", "URL", "ID"],
			[30, 4, 10, 50, 36],
		),
});
