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
			["name", "branch", "projectName", "hostName"],
			["NAME", "BRANCH", "PROJECT", "HOST"],
			30,
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

		const [workspaces, hosts] = await Promise.all([
			ctx.api.v2Workspace.list.query({ organizationId, hostId }),
			ctx.api.host.list.query({ organizationId }),
		]);
		const hostNameById = new Map(hosts.map((host) => [host.id, host.name]));
		return workspaces.map((workspace) => ({
			...workspace,
			hostName: hostNameById.get(workspace.hostId) ?? workspace.hostId,
		}));
	},
});
