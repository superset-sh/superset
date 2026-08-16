import { boolean, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePluginHost } from "../lib";

export default command({
	description: "List plugins installed on a host",
	options: {
		host: string().desc("Target host machineId (default: this machine)"),
		local: boolean().desc("Target this machine (the default)"),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["id", "version", "status", "sourceType", "error"],
			["ID", "VERSION", "STATUS", "SOURCE", "ERROR"],
		),
	run: async ({ ctx, options }) => {
		const target = await resolvePluginHost(ctx, {
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		return await target.client.plugins.list.query();
	},
});
