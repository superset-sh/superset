import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	findSection,
	queueSidebarOperationWithSnapshotUpdate,
	requireOrganizationId,
} from "../../../../lib/sidebar-groups";

export default command({
	description:
		"Delete a desktop sidebar workspace group and ungroup its members",
	args: [positional("id").required().desc("Group ID")],
	run: async ({ ctx, args }) => {
		const organizationId = requireOrganizationId(ctx.config.organizationId);
		const { data } = queueSidebarOperationWithSnapshotUpdate(
			organizationId,
			(snapshot) => {
				const section = findSection(snapshot, args.id as string);
				const ungroupedWorkspaceIds = snapshot.workspaces
					.filter((workspace) => workspace.sectionId === section.id)
					.map((workspace) => workspace.id);
				const nextTopLevelOrder =
					Math.max(
						0,
						...snapshot.workspaces
							.filter(
								(workspace) =>
									workspace.projectId === section.projectId &&
									workspace.sectionId === null,
							)
							.map((workspace) => workspace.tabOrder),
					) + 1;
				const nextSnapshot = {
					...snapshot,
					updatedAt: new Date().toISOString(),
					sections: snapshot.sections.filter(
						(candidate) => candidate.id !== section.id,
					),
					workspaces: snapshot.workspaces.map((workspace) => {
						const ungroupedIndex = ungroupedWorkspaceIds.indexOf(workspace.id);
						return ungroupedIndex === -1
							? workspace
							: {
									...workspace,
									sectionId: null,
									tabOrder: nextTopLevelOrder + ungroupedIndex,
								};
					}),
				};

				return {
					data: { id: section.id, name: section.name },
					operation: {
						id: crypto.randomUUID(),
						type: "deleteSection",
						createdAt: new Date().toISOString(),
						sectionId: section.id,
					},
					snapshot: nextSnapshot,
				};
			},
		);

		return {
			data,
			message: `Queued sidebar group deletion for "${data.name}"`,
		};
	},
});
