import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	queueSidebarOperationWithSnapshotUpdate,
	requireOrganizationId,
} from "../../../../lib/sidebar-groups";

export default command({
	description: "Remove one or more workspaces from any desktop sidebar group",
	args: [
		positional("workspaceIds").required().variadic().desc("Workspace IDs"),
	],
	run: async ({ ctx, args }) => {
		const organizationId = requireOrganizationId(ctx.config.organizationId);
		const workspaceIds = args.workspaceIds as string[];

		const { data } = queueSidebarOperationWithSnapshotUpdate(
			organizationId,
			(snapshot) => {
				for (const workspaceId of workspaceIds) {
					if (
						!snapshot.workspaces.some(
							(workspace) => workspace.id === workspaceId,
						)
					) {
						throw new CLIError(`Workspace not found: ${workspaceId}`);
					}
				}

				const movedWorkspaceIds = new Set(workspaceIds);
				const nextTabOrderByProject = new Map<string, number>();
				for (const workspace of snapshot.workspaces) {
					if (
						workspace.sectionId !== null ||
						movedWorkspaceIds.has(workspace.id)
					) {
						continue;
					}
					nextTabOrderByProject.set(
						workspace.projectId,
						Math.max(
							nextTabOrderByProject.get(workspace.projectId) ?? 0,
							workspace.tabOrder,
						),
					);
				}

				const nextSnapshot = {
					...snapshot,
					updatedAt: new Date().toISOString(),
					workspaces: snapshot.workspaces.map((workspace) => {
						if (!movedWorkspaceIds.has(workspace.id)) return workspace;
						const tabOrder =
							(nextTabOrderByProject.get(workspace.projectId) ?? 0) + 1;
						nextTabOrderByProject.set(workspace.projectId, tabOrder);
						return { ...workspace, sectionId: null, tabOrder };
					}),
				};

				return {
					data: { workspaceIds },
					operation: {
						id: crypto.randomUUID(),
						type: "moveWorkspaces",
						createdAt: new Date().toISOString(),
						workspaceIds,
						sectionId: null,
					},
					snapshot: nextSnapshot,
				};
			},
		);

		return {
			data,
			message: `Queued ${workspaceIds.length} workspace(s) to leave sidebar groups`,
		};
	},
});
