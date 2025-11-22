import type { Project, Workspace } from "main/lib/db/schemas";
import { getAllWithWorkspaces } from "../../projects/utils";

/**
 * Finds the adjacent workspace to activate after deleting a workspace.
 *
 * @param allProjects - All projects in the database
 * @param allWorkspaces - All workspaces in the database
 * @param deletedWorkspaceId - The ID of the workspace being deleted
 * @returns The workspace that should become active, or undefined
 */
export function findAdjacentWorkspace(
	allProjects: Project[],
	allWorkspaces: Workspace[],
	deletedWorkspaceId: string,
): Workspace | undefined {
	const grouped = getAllWithWorkspaces(allProjects, allWorkspaces);
	const orderedWorkspaces = grouped.flatMap((group) => group.workspaces);

	const deletedIndex = orderedWorkspaces.findIndex(
		(w) => w.id === deletedWorkspaceId,
	);

	if (deletedIndex === -1 || orderedWorkspaces.length === 0) return undefined;

	if (deletedIndex > 0) {
		return orderedWorkspaces[deletedIndex - 1];
	}

	if (deletedIndex < orderedWorkspaces.length - 1) {
		return orderedWorkspaces[deletedIndex + 1];
	}

	return undefined;
}
