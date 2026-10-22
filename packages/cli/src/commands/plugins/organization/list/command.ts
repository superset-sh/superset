import { table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description:
		"List your organization's plugins. Admins see every plugin and who it is offered to",
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "version", "repo", "member", "admin", "owner"],
			["PLUGIN", "VERSION", "SOURCE", "MEMBER", "ADMIN", "OWNER"],
			[24, 18, 28, 12, 12, 12],
		),
	run: async ({ ctx }) => {
		const plugins = await ctx.api.plugins.organization.list.query();
		return {
			data: plugins.map((plugin) => ({
				...plugin,
				repo: plugin.removedFromSourceAt
					? `${plugin.repo ?? ""} (removed)`
					: plugin.repo,
				member: plugin.policy.member ?? "unavailable",
				admin: plugin.policy.admin ?? "unavailable",
				owner: plugin.policy.owner ?? "unavailable",
			})),
			message: plugins.length
				? `${plugins.length} plugin${plugins.length === 1 ? "" : "s"}.`
				: "Your organization has no plugins. Sync them from a repository: superset plugins organization sources add <owner/repo>",
		};
	},
});
