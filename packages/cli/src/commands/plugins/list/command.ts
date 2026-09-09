import { boolean, table } from "@superset/cli-framework";
import type { RouterOutputs } from "@superset/trpc";
import { command } from "../../../lib/command";

type CatalogPlugin = RouterOutputs["plugins"]["list"][number];

export default command({
	description:
		"List installed plugins, or everything available with --available",
	options: {
		available: boolean().desc("Include plugins you have not installed"),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "version", "status", "account", "pluginId"],
			["PLUGIN", "VERSION", "STATUS", "ACCOUNT", "PLUGIN ID"],
			[16, 9, 24, 24, 38],
		),
	run: async ({ ctx, options }) => {
		const plugins = await ctx.api.plugins.list.query();

		const visible = options.available
			? plugins
			: plugins.filter((plugin) => plugin.installed);

		const status = (plugin: CatalogPlugin) => {
			if (!plugin.installed) return "available";
			if (!plugin.enabled) return "disabled";
			if (plugin.authMethods.length > 0 && plugin.connections.length === 0) {
				return "needs connection";
			}
			return plugin.accounts.length
				? `connected: ${plugin.accounts.join(", ")}`
				: "installed";
		};

		return {
			data: visible.flatMap((plugin) => {
				const row = {
					name: plugin.name,
					version: plugin.version,
					marketplace: plugin.marketplace,
					status: status(plugin),
					connections: plugin.connections,
					description: plugin.description,
				};
				if (plugin.connections.length === 0) {
					return [{ ...row, pluginId: "", account: null }];
				}
				return plugin.connections.map((connection) => ({
					...row,
					pluginId: connection.id,
					account: connection.account,
				}));
			}),
			message: visible.length
				? `${visible.length} plugin${visible.length === 1 ? "" : "s"}.`
				: "No plugins installed. See what's available: superset plugins list --available",
		};
	},
});
