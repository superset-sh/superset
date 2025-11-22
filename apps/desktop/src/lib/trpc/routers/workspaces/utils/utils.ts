import type { Project, Workspace } from "main/lib/db/schemas";
import { getAllWithWorkspaces } from "../../projects/utils";

/**
 * Finds the adjacent workspace to activate after deleting a workspace.
 * Considers the global ordering: projects (by project.tabOrder), then workspaces within each project (by workspace.tabOrder).
 *
 * Logic: When you close a workspace, activate:
 * 1. The previous workspace in the global ordering (if exists)
 * 2. If no previous workspace, activate the next workspace
 * 3. If no workspaces remain, return undefined
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
	// Build flat ordered list of workspaces using existing logic
	const grouped = getAllWithWorkspaces(allProjects, allWorkspaces);
	const orderedWorkspaces = grouped.flatMap((group) => group.workspaces);

	// Find the deleted workspace's index
	const deletedIndex = orderedWorkspaces.findIndex(
		(w) => w.id === deletedWorkspaceId,
	);

	if (deletedIndex === -1 || orderedWorkspaces.length === 0) return undefined;

	// Try to activate the previous workspace first
	if (deletedIndex > 0) {
		return orderedWorkspaces[deletedIndex - 1];
	}

	// No previous workspace, activate next (at same index after deletion)
	if (deletedIndex < orderedWorkspaces.length - 1) {
		return orderedWorkspaces[deletedIndex + 1];
	}

	// Only one workspace and we're deleting it
	return undefined;
}
