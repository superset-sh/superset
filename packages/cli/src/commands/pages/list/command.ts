import { string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceId } from "../workspaceRef";

export default command({
	description:
		"List pages in the organization, most recently updated first. Lists every page you can read, from every workspace, unless --workspace narrows it",
	options: {
		search: string()
			.alias("s")
			.desc("Only pages whose title, description, or slug contains this text"),
		workspace: string().desc(
			"Only pages published from this workspace, by name or id. Pass $SUPERSET_WORKSPACE_ID for the current one",
		),
	},
	run: async ({ ctx, options }) => {
		const workspaceId = options.workspace
			? await resolveWorkspaceId({
					value: options.workspace,
					organizationId: ctx.config.organizationId,
					userJwt: ctx.bearer,
					api: ctx.api,
				})
			: undefined;
		return await ctx.api.page.list.query({
			...(workspaceId ? { workspaceId } : {}),
			...(options.search ? { search: options.search } : {}),
		});
	},
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				title: row.title,
				version: row.latestVersion,
				visibility: row.visibility,
				updated: row.updatedAt,
				url: row.url,
				id: row.id,
			})),
			["title", "version", "visibility", "updated", "url", "id"],
			["TITLE", "V", "VISIBILITY", "UPDATED", "URL", "ID"],
			[30, 4, 10, 24, 50, 36],
		),
});
