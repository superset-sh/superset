import { boolean, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePluginHost } from "../lib";

export default command({
	description: "Uninstall a plugin",
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
		await target.client.plugins.uninstall.mutate({ id });
		return { data: { id }, message: `Uninstalled ${id}` };
	},
});
