import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveConnectionId } from "../../../lib/plugins/connection-ref";
import { readStdin } from "../../../lib/plugins/inputs";

export default command({
	description: "Call a tool on a connected plugin",
	args: [
		positional("plugin").desc("Plugin name, when it has one connection"),
		positional("tool").required().desc("Tool name"),
		positional("arguments").desc(
			'Tool arguments as JSON (default: {}; "-" reads them from stdin)',
		),
	],
	options: {
		connection: string().desc("Connection id from `superset plugins list`"),
		pluginId: string().desc("Deprecated alias for --connection"),
	},
	run: async ({ ctx, args, options }) => {
		const tool = args.tool as string;
		const connectionId = await resolveConnectionId(ctx.api, {
			connection: (options.connection ?? options.pluginId) as
				| string
				| undefined,
			plugin: args.plugin as string | undefined,
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

		const { result } = await ctx.api.plugins.tools.call.mutate({
			connectionId,
			tool,
			arguments: parsed,
		});

		return {
			data: result,
			message: JSON.stringify(result, null, 2),
		};
	},
});
