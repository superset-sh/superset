import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePluginName } from "../../../lib/plugins/connection-ref";
import { readStdin } from "../../../lib/plugins/inputs";
import { connectPluginMcp } from "../../../lib/plugins/mcp-client";

export default command({
	description: "Call a tool on a connected plugin",
	args: [
		positional("tool").required().desc("Tool name"),
		positional("arguments").desc(
			'Tool arguments as JSON (default: {}; "-" reads them from stdin)',
		),
	],
	options: {
		plugin: string().desc("Plugin name from `superset plugins list`"),
		connection: string().desc("Deprecated alias for --plugin"),
		pluginId: string().desc("Deprecated alias for --plugin"),
	},
	run: async ({ ctx, args, options }) => {
		const tool = args.tool as string;
		const pluginName = resolvePluginName({
			plugin: options.plugin as string | undefined,
			connection: options.connection as string | undefined,
			pluginId: options.pluginId as string | undefined,
		});

		const raw = args.arguments as string | undefined;
		const source = (raw === "-" ? await readStdin() : raw) ?? "{}";
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(source) as Record<string, unknown>;
		} catch (error) {
			throw new CLIError(
				`Arguments must be JSON: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		const { client } = await connectPluginMcp(pluginName, ctx.bearer);
		try {
			const result = await client.callTool({
				name: tool,
				arguments: parsed,
			});
			return {
				data: result,
				message: JSON.stringify(result, null, 2),
			};
		} finally {
			await client.close();
		}
	},
});
