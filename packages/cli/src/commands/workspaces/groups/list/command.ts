import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../../lib/command";
import { resolveProjectId } from "../../../../lib/host-sections";
import {
	resolveHostFilter,
	resolveHostTarget,
} from "../../../../lib/host-target";

export default command({
	description: "List workspace groups on a host",
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine (the default)"),
		project: string().desc("Filter by project name (case-insensitive) or id"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "projectName", "workspaceCount", "id"],
			["NAME", "PROJECT", "WORKSPACES", "ID"],
			[30, 30, 10, 36],
		),
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId =
			resolveHostFilter({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}) ?? getHostId();
		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const projectId = options.project
			? await resolveProjectId(target.client, options.project)
			: undefined;

		const [sections, workspaces, projects] = await Promise.all([
			target.client.sections.list.query(projectId ? { projectId } : undefined),
			target.client.workspace.list.query(),
			target.client.project.list.query(),
		]);

		const projectNameById = new Map(
			projects.map((project) => [project.id, project.name]),
		);
		const workspaceCountBySection = new Map<string, number>();
		for (const workspace of workspaces) {
			if (!workspace.sectionId) continue;
			workspaceCountBySection.set(
				workspace.sectionId,
				(workspaceCountBySection.get(workspace.sectionId) ?? 0) + 1,
			);
		}

		return sections.map((section) => ({
			...section,
			projectName: projectNameById.get(section.projectId) ?? section.projectId,
			workspaceCount: workspaceCountBySection.get(section.id) ?? 0,
		}));
	},
});
