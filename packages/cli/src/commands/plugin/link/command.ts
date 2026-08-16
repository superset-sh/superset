import path from "node:path";
import { boolean, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { describeRegisterOutcome, resolvePluginHost } from "../lib";

export default command({
	description: "Register a plugin directory in place for development",
	args: [positional("dir").desc("Plugin directory (default: current)")],
	options: {
		host: string().desc("Target host machineId (default: this machine)"),
		local: boolean().desc("Target this machine (the default)"),
	},
	run: async ({ ctx, args, options }) => {
		const dir = path.resolve((args.dir as string | undefined) ?? ".");
		const target = await resolvePluginHost(ctx, {
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const result = await target.client.plugins.link.mutate({ path: dir });
		return {
			data: result,
			message: describeRegisterOutcome("Linked", result),
		};
	},
});
