import { CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List workspaces accessible to you in the active organization",
	options: {
		host: string().desc("Filter to a specific host (machineId)"),
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

		return ctx.api.v2Workspace.list.query({
			organizationId,
			hostId: options.host ?? undefined,
		});
	},
});
