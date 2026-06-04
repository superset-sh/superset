import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter } from "../../../lib/host-target";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default command({
	description: "List workspaces accessible to you in the active organization",
	options: {
		host: string().desc("Filter to a specific host (machineId)"),
		local: boolean().desc("Filter to this machine"),
		project: string().desc("Filter by project name (case-insensitive) or id"),
		search: string()
			.alias("s")
			.desc("Search by workspace name or branch substring"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "branch", "projectName", "hostName", "id"],
			["NAME", "BRANCH", "PROJECT", "HOST", "ID"],
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

		const projectInput = options.project ?? undefined;
		const projectId =
			projectInput && UUID_RE.test(projectInput) ? projectInput : undefined;
		const projectName = projectInput && !projectId ? projectInput : undefined;

		const [workspaces, hosts] = await Promise.all([
			ctx.api.v2Workspace.list.query({
				organizationId,
				hostId,
				projectId,
				projectName,
				search: options.search ?? undefined,
			}),
			ctx.api.host.list.query({ organizationId }),
		]);
		const hostNameById = new Map(hosts.map((host) => [host.id, host.name]));
		return workspaces.map((workspace) => ({
			...workspace,
			hostName: hostNameById.get(workspace.hostId) ?? workspace.hostId,
		}));
	},
});
