import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	findSection,
	queueSidebarOperationWithSnapshotUpdate,
	requireOrganizationId,
} from "../../../../lib/sidebar-groups";

export default command({
	description: "Rename a desktop sidebar workspace group",
	args: [positional("id").required().desc("Group ID")],
	options: {
		name: string().required().desc("New group name"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = requireOrganizationId(ctx.config.organizationId);
		const name = options.name.trim();
		if (name.length === 0) throw new CLIError("Group name cannot be empty");

		const { data } = queueSidebarOperationWithSnapshotUpdate(
			organizationId,
			(snapshot) => {
				const section = findSection(snapshot, args.id as string);
				const nextSnapshot = {
					...snapshot,
					updatedAt: new Date().toISOString(),
					sections: snapshot.sections.map((candidate) =>
						candidate.id === section.id ? { ...candidate, name } : candidate,
					),
				};

				return {
					data: { id: section.id, name },
					operation: {
						id: crypto.randomUUID(),
						type: "renameSection",
						createdAt: new Date().toISOString(),
						sectionId: section.id,
						name,
					},
					snapshot: nextSnapshot,
				};
			},
		);

		return {
			data,
			message: `Queued sidebar group rename to "${name}"`,
		};
	},
});
