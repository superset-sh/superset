import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter } from "../../../lib/host-target";

export default command({
	description: "List workspaces accessible to you in the active organization",
	options: {
		host: string().desc("Filter to a specific host (machineId)"),
		local: boolean().desc("Filter to this machine"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["id", "name", "branch", "projectName", "hostId"],
			["ID", "NAME", "BRANCH", "PROJECT", "HOST"],
		),
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		return ctx.api.v2Workspace.list.query({
			organizationId,
			hostId,
		});
	},
});
