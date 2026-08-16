import { boolean, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { describeRegisterOutcome, resolvePluginHost } from "../lib";

export default command({
	description: "Reload a plugin (re-reads a linked plugin's manifest)",
	args: [positional("id").required().desc("Plugin ID")],
	options: {
		host: string().desc("Target host machineId (default: this machine)"),
		local: boolean().desc("Target this machine (the default)"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const target = await resolvePluginHost(ctx, {
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const result = await target.client.plugins.reload.mutate({ id });
		return {
			data: result,
			message: describeRegisterOutcome("Reloaded", result),
		};
	},
});
