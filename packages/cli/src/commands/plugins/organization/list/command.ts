import { table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description:
		"List your organization's plugins. Admins also see the ones not yet published",
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "version", "status", "connector"],
			["PLUGIN", "VERSION", "STATUS", "CONNECTOR"],
			[24, 10, 12, 20],
		),
	run: async ({ ctx }) => {
		const plugins = await ctx.api.plugins.organization.list.query();
		return {
			data: plugins.map((plugin) => ({
				...plugin,
				status: plugin.publishedAt ? "published" : "draft",
			})),
			message: plugins.length
				? `${plugins.length} plugin${plugins.length === 1 ? "" : "s"}.`
				: "Your organization has no plugins. Add one: superset plugins organization upload <dir>",
		};
	},
});
