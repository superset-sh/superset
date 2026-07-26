import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter } from "../../../lib/host-target";
import { listWorkspacesOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "List workspaces on a host (default: this machine)",
	options: {
		host: string().desc("List workspaces on a specific host (machineId)"),
		local: boolean().desc("List workspaces on this machine (the default)"),
		project: string().desc("Filter by project name (case-insensitive) or id"),
		search: string()
			.alias("s")
			.desc("Search by workspace name or branch substring"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "branch", "projectName", "groupName", "id"],
			["NAME", "BRANCH", "PROJECT", "GROUP", "ID"],
			[30, 30, 30, 20, 36],
		),
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { workspaces, sections } = await listWorkspacesOnHost({
			organizationId,
			userJwt: ctx.bearer,
			hostId: resolveHostFilter({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}),
		});

		const sectionNameById = new Map(
			sections.map((section) => [section.id, section.name]),
		);
		const projectInput = options.project?.toLowerCase();
		const search = options.search?.toLowerCase();
		return workspaces
			.filter(
				(workspace) =>
					!projectInput ||
					workspace.projectId.toLowerCase() === projectInput ||
					workspace.projectName?.toLowerCase() === projectInput,
			)
			.filter(
				(workspace) =>
					!search ||
					workspace.name.toLowerCase().includes(search) ||
					workspace.branch.toLowerCase().includes(search),
			)
			.map((workspace) => ({
				...workspace,
				projectName: workspace.projectName ?? workspace.projectId,
				groupName: workspace.sectionId
					? (sectionNameById.get(workspace.sectionId) ?? workspace.sectionId)
					: "",
			}));
	},
});
