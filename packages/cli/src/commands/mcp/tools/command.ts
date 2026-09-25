import { string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePluginName } from "../../../lib/plugins/connection-ref";
import { connectPluginMcp } from "../../../lib/plugins/mcp-client";

export default command({
	description: "List the tools a connected plugin exposes",
	args: [],
	options: {
		plugin: string().desc("Plugin name from `superset plugins list`"),
		connection: string().desc("Deprecated alias for --plugin"),
		pluginId: string().desc("Deprecated alias for --plugin"),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["plugin", "tool", "description"],
			["PLUGIN", "TOOL", "DESCRIPTION"],
			[16, 30, 70],
		),
	run: async ({ ctx, options }) => {
		const pluginName = resolvePluginName({
			plugin: options.plugin as string | undefined,
			connection: options.connection as string | undefined,
			pluginId: options.pluginId as string | undefined,
		});

		const { client, ref } = await connectPluginMcp(pluginName, ctx.bearer);
		try {
			const { tools } = await client.listTools();
			return {
				data: tools.map((tool) => ({
					plugin: ref.plugin,
					tool: tool.name,
					description: tool.description ?? "",
				})),
				message: `${tools.length} tool${tools.length === 1 ? "" : "s"} on ${ref.plugin}.`,
			};
		} finally {
			await client.close();
		}
	},
});
