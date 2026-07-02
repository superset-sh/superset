import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	findSection,
	queueSidebarOperationWithSnapshotUpdate,
	requireOrganizationId,
} from "../../../../lib/sidebar-groups";

export default command({
	description: "Move one or more workspaces into a desktop sidebar group",
	args: [
		positional("groupId").required().desc("Target group ID"),
		positional("workspaceIds").required().variadic().desc("Workspace IDs"),
	],
	run: async ({ ctx, args }) => {
		const organizationId = requireOrganizationId(ctx.config.organizationId);
		const workspaceIds = args.workspaceIds as string[];

		const { data } = queueSidebarOperationWithSnapshotUpdate(
			organizationId,
			(snapshot) => {
				const section = findSection(snapshot, args.groupId as string);
				for (const workspaceId of workspaceIds) {
					const workspace = snapshot.workspaces.find(
						(candidate) => candidate.id === workspaceId,
					);
					if (!workspace) {
						throw new CLIError(`Workspace not found: ${workspaceId}`);
					}
					if (workspace.projectId !== section.projectId) {
						throw new CLIError(
							"Cannot move workspace to a group in a different project",
							`Workspace ${workspaceId} belongs to project ${workspace.projectId}; group ${section.id} belongs to project ${section.projectId}.`,
						);
					}
				}

				const movedWorkspaceIds = new Set(workspaceIds);
				const sectionWorkspaceCount = snapshot.workspaces.filter(
					(workspace) =>
						workspace.sectionId === section.id &&
						!movedWorkspaceIds.has(workspace.id),
				).length;
				const nextSnapshot = {
					...snapshot,
					updatedAt: new Date().toISOString(),
					workspaces: snapshot.workspaces.map((workspace) => {
						const movedIndex = workspaceIds.indexOf(workspace.id);
						return movedWorkspaceIds.has(workspace.id)
							? {
									...workspace,
									sectionId: section.id,
									tabOrder: sectionWorkspaceCount + movedIndex + 1,
								}
							: workspace;
					}),
				};

				return {
					data: { groupId: section.id, groupName: section.name, workspaceIds },
					operation: {
						id: crypto.randomUUID(),
						type: "moveWorkspaces",
						createdAt: new Date().toISOString(),
						workspaceIds,
						sectionId: section.id,
					},
					snapshot: nextSnapshot,
				};
			},
		);

		return {
			data,
			message: `Queued ${workspaceIds.length} workspace(s) to move into "${data.groupName}"`,
		};
	},
});
