import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "List agents configured on a host",
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["label", "presetId", "command", "id"],
			["LABEL", "PRESET", "COMMAND", "ID"],
		),
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		return target.client.settings.agentConfigs.list.query();
	},
});
