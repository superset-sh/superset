import { string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveConnectionId } from "../../../lib/plugins/connection-ref";

export default command({
	description: "List the tools a connected plugin exposes",
	args: [],
	options: {
		connection: string().desc("Connection id from `superset plugins list`"),
		pluginId: string().desc("Deprecated alias for --connection"),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["plugin", "tool", "description"],
			["PLUGIN", "TOOL", "DESCRIPTION"],
			[16, 30, 70],
		),
	run: async ({ ctx, options }) => {
		const connectionId = resolveConnectionId({
			connection: options.connection as string | undefined,
			pluginId: options.pluginId as string | undefined,
		});

		const { plugin, tools } = await ctx.api.plugins.tools.list.query({
			connectionId,
		});

		return {
			data: tools.map((tool) => ({
				plugin,
				tool: tool.name,
				description: tool.description ?? "",
			})),
			message: `${tools.length} tool${tools.length === 1 ? "" : "s"} on ${plugin}.`,
		};
	},
});
