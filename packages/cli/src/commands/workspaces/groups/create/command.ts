import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	assertSameProject,
	queueSidebarOperationWithSnapshotUpdate,
	requireOrganizationId,
} from "../../../../lib/sidebar-groups";

export default command({
	description:
		"Create a desktop sidebar workspace group and optionally move workspaces into it",
	args: [positional("workspaceIds").variadic().desc("Workspace IDs to group")],
	options: {
		name: string().required().desc("Group name"),
		project: string().desc("Project ID for an empty group"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = requireOrganizationId(ctx.config.organizationId);
		const workspaceIds = (args.workspaceIds as string[] | undefined) ?? [];
		const projectOption = options.project?.trim();
		if (workspaceIds.length === 0 && !projectOption) {
			throw new CLIError(
				"Pass at least one workspace ID or --project",
				"Example: superset workspaces groups create --name Backend <workspace-id>",
			);
		}

		const sectionId = crypto.randomUUID();
		const createdAt = new Date().toISOString();
		const name = options.name.trim();

		if (name.length === 0) {
			throw new CLIError("Group name cannot be empty");
		}

		const { data } = queueSidebarOperationWithSnapshotUpdate(
			organizationId,
			(snapshot) => {
				const projectId =
					workspaceIds.length > 0
						? assertSameProject(workspaceIds, snapshot)
						: projectOption;
				if (!projectId) {
					throw new CLIError("Project ID cannot be empty");
				}

				const movedWorkspaceIds = new Set(workspaceIds);
				const nextSnapshot = {
					...snapshot,
					sections: [
						...snapshot.sections,
						{
							id: sectionId,
							projectId,
							name,
							createdAt,
							tabOrder:
								Math.max(
									0,
									...snapshot.sections
										.filter((section) => section.projectId === projectId)
										.map((section) => section.tabOrder),
								) + 1,
							isCollapsed: false,
							color: null,
						},
					],
					workspaces: snapshot.workspaces.map((workspace) => {
						const movedIndex = workspaceIds.indexOf(workspace.id);
						return movedWorkspaceIds.has(workspace.id)
							? {
									...workspace,
									sectionId,
									tabOrder: movedIndex + 1,
								}
							: workspace;
					}),
					updatedAt: createdAt,
				};

				return {
					data: { id: sectionId, name, projectId, workspaceIds },
					operation: {
						id: crypto.randomUUID(),
						type: "createSection",
						createdAt,
						sectionId,
						projectId,
						name,
						workspaceIds,
					},
					snapshot: nextSnapshot,
				};
			},
		);

		return {
			data,
			message: `Queued sidebar group "${name}" (${sectionId}). The desktop app applies it when running.`,
		};
	},
});
