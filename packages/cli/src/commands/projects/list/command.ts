import { CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "List projects on a host",
	options: {
		host: string().desc("Target host machineId (defaults to this machine)"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["id", "repoOwner", "repoName", "repoPath"],
			["ID", "OWNER", "REPO", "PATH"],
		),
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const target = resolveHostTarget({
			requestedHostId: options.host ?? undefined,
			organizationId,
			userJwt: ctx.bearer,
		});

		return target.client.project.list.query();
	},
});
