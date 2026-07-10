import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter } from "../../../lib/host-target";
import { listHostWorkspaces } from "../../../lib/host-workspaces";

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
			[30, 30, 30, 30, 36],
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

		// Workspace records are host-owned: fan out to each online host's
		// workspace.list and merge (the cloud only supplies host/project names).
		const [{ workspaces, hosts, warnings }, projects] = await Promise.all([
			listHostWorkspaces({
				api: ctx.api,
				organizationId,
				userJwt: ctx.bearer,
				hostId,
			}),
			ctx.api.v2Project.list
				.query({ organizationId })
				.catch(() => [] as Array<{ id: string; name: string }>),
		]);
		for (const warning of warnings) {
			process.stderr.write(`Warning: ${warning}\n`);
		}

		const projectNameById = new Map(
			projects.map((project) => [project.id, project.name]),
		);

		const projectInput = options.project ?? undefined;
		let projectId =
			projectInput && UUID_RE.test(projectInput) ? projectInput : undefined;
		if (projectInput && !projectId) {
			const wanted = projectInput.toLowerCase();
			projectId = projects.find(
				(project) => project.name.toLowerCase() === wanted,
			)?.id;
			if (!projectId) {
				throw new CLIError(
					`Project not found: ${projectInput}`,
					projects.length === 0
						? "Project names resolve via the cloud API — pass --project <uuid> when offline"
						: "Run: superset projects list",
				);
			}
		}

		const search = options.search?.toLowerCase();
		const hostNameById = new Map(hosts.map((host) => [host.id, host.name]));
		return workspaces
			.filter((workspace) => !projectId || workspace.projectId === projectId)
			.filter(
				(workspace) =>
					!search ||
					workspace.name.toLowerCase().includes(search) ||
					workspace.branch.toLowerCase().includes(search),
			)
			.map((workspace) => ({
				...workspace,
				projectName:
					projectNameById.get(workspace.projectId) ?? workspace.projectId,
				hostName: hostNameById.get(workspace.hostId) ?? workspace.hostId,
			}));
	},
});
