import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePluginHost } from "../lib";

export default command({
	description: "Invoke a plugin backend action and print the result",
	args: [
		positional("id").required().desc("Plugin ID"),
		positional("action").required().desc("Action name"),
	],
	options: {
		params: string().desc("Action params as JSON"),
		workspace: string().desc("Workspace ID to scope the action to"),
		host: string().desc("Target host machineId (default: this machine)"),
		local: boolean().desc("Target this machine (the default)"),
	},
	run: async ({ ctx, args, options }) => {
		let params: unknown;
		if (options.params) {
			try {
				params = JSON.parse(options.params);
			} catch (error) {
				throw new CLIError(
					`--params is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		const target = await resolvePluginHost(ctx, {
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const result = await target.client.plugins.invokeAction.mutate({
			id: args.id as string,
			action: args.action as string,
			params,
			workspaceId: options.workspace ?? undefined,
		});
		return { data: result ?? null };
	},
});
