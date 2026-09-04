import { string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List the plugin accounts connected to your Superset account",
	options: {
		plugin: string().desc("Only this plugin"),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["plugin", "account", "id"],
			["PLUGIN", "ACCOUNT", "CONNECTION"],
			[18, 36, 38],
		),
	run: async ({ ctx, options }) => {
		const plugin = options.plugin as string | undefined;
		const connections = await ctx.api.plugins.connections.list.query({
			plugin,
		});

		return {
			data: connections.map((connection) => ({
				plugin: connection.plugin,
				account: connection.account ?? connection.accountId,
				id: connection.id,
				createdAt: connection.createdAt,
			})),
			message: connections.length
				? `${connections.length} connection${connections.length === 1 ? "" : "s"}.`
				: "No connections. Connect one with: superset plugins connect <name>",
		};
	},
});
