import {
	projects,
	type SelectProject,
	type SelectWorkspace,
	type SelectWorktree,
	settings,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

// Port allocation constants for multi-worktree dev instances
const START_PORT = 3000;
const PORT_RANGE = 10;

import { localDb } from "main/lib/local-db";

/**
 * Set the last active workspace in settings.
 * Uses upsert to handle both initial and subsequent calls.
 */
export function setLastActiveWorkspace(workspaceId: string | null): void {
	localDb
		.insert(settings)
		.values({ id: 1, lastActiveWorkspaceId: workspaceId })
		.onConflictDoUpdate({
			target: settings.id,
			set: { lastActiveWorkspaceId: workspaceId },
		})
		.run();
}

/**
 * Get the maximum tab order for workspaces in a project (excluding those being deleted).
 * Returns -1 if no workspaces exist.
 */
export function getMaxWorkspaceTabOrder(projectId: string): number {
	const projectWorkspaces = localDb
		.select()
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.deletingAt)),
		)
		.all();
	return projectWorkspaces.length > 0
		? Math.max(...projectWorkspaces.map((w) => w.tabOrder))
		: -1;
}

/**
 * Get the maximum tab order for active projects.
 * Returns -1 if no active projects exist.
 */
export function getMaxProjectTabOrder(): number {
	const activeProjects = localDb
		.select()
		.from(projects)
		.where(isNotNull(projects.tabOrder))
		.all();
	return activeProjects.length > 0
		? Math.max(...activeProjects.map((p) => p.tabOrder ?? 0))
		: -1;
}

/**
 * Update project's lastOpenedAt and tabOrder (if not already set).
 * This is called when opening or creating a workspace to ensure the project
 * appears in the active projects list.
 */
export function activateProject(project: SelectProject): void {
	const maxProjectTabOrder = getMaxProjectTabOrder();
	localDb
		.update(projects)
		.set({
			lastOpenedAt: Date.now(),
			tabOrder:
				project.tabOrder === null ? maxProjectTabOrder + 1 : project.tabOrder,
		})
		.where(eq(projects.id, project.id))
		.run();
}

/**
 * Hide a project from the sidebar by setting tabOrder to null.
 * Called when the last workspace in a project is deleted/closed.
 */
export function hideProject(projectId: string): void {
	localDb
		.update(projects)
		.set({ tabOrder: null })
		.where(eq(projects.id, projectId))
		.run();
}

/**
 * Check if a project has any remaining workspaces.
 * If not, hide it from the sidebar.
 *
 * Note: We check for ANY workspaces (including those being deleted) to avoid
 * prematurely hiding the project when multiple workspaces are being deleted
 * concurrently. The project should only be hidden when all deletions complete.
 */
export function hideProjectIfNoWorkspaces(projectId: string): void {
	const remainingWorkspaces = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.projectId, projectId))
		.all();
	if (remainingWorkspaces.length === 0) {
		hideProject(projectId);
	}
}

/**
 * Select the next active workspace after the current one is removed.
 * Returns the ID of the next workspace to activate, or null if none.
 * Selects the most recently opened workspace from VISIBLE projects only
 * (projects with tabOrder != null). This ensures the selected workspace
 * will appear in the sidebar and can be properly displayed by the frontend.
 */
export function selectNextActiveWorkspace(): string | null {
	const sorted = localDb
		.select({ id: workspaces.id, lastOpenedAt: workspaces.lastOpenedAt })
		.from(workspaces)
		.innerJoin(projects, eq(workspaces.projectId, projects.id))
		.where(
			and(
				isNull(workspaces.deletingAt),
				isNotNull(projects.tabOrder), // Only visible projects
			),
		)
		.orderBy(desc(workspaces.lastOpenedAt))
		.all();
	return sorted[0]?.id ?? null;
}

/**
 * Update settings to point to the next active workspace if the current
 * active workspace was removed.
 */
export function updateActiveWorkspaceIfRemoved(
	removedWorkspaceId: string,
): void {
	const settingsRow = localDb.select().from(settings).get();
	if (settingsRow?.lastActiveWorkspaceId === removedWorkspaceId) {
		const newActiveId = selectNextActiveWorkspace();
		setLastActiveWorkspace(newActiveId);
	}
}

/**
 * Fetch a workspace by ID.
 */
export function getWorkspace(workspaceId: string): SelectWorkspace | undefined {
	return localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
}

/**
 * Fetch a workspace by ID, excluding workspaces that are being deleted.
 * Use this for operations that shouldn't operate on deleting workspaces
 * (e.g., setActive, update, setUnread).
 */
export function getWorkspaceNotDeleting(
	workspaceId: string,
): SelectWorkspace | undefined {
	return localDb
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletingAt)))
		.get();
}

/**
 * Fetch a project by ID.
 */
export function getProject(projectId: string): SelectProject | undefined {
	return localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
}

/**
 * Fetch a worktree by ID.
 */
export function getWorktree(worktreeId: string): SelectWorktree | undefined {
	return localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.id, worktreeId))
		.get();
}

/**
 * Fetch a workspace with its related worktree and project.
 * Returns null if workspace not found.
 */
export function getWorkspaceWithRelations(workspaceId: string): {
	workspace: SelectWorkspace;
	worktree: SelectWorktree | null;
	project: SelectProject | null;
} | null {
	const workspace = getWorkspace(workspaceId);
	if (!workspace) {
		return null;
	}

	const worktree = workspace.worktreeId
		? (getWorktree(workspace.worktreeId) ?? null)
		: null;
	const project = getProject(workspace.projectId) ?? null;

	return { workspace, worktree, project };
}

/**
 * Update a workspace's timestamps for lastOpenedAt and updatedAt.
 */
export function touchWorkspace(
	workspaceId: string,
	additionalFields?: Partial<{
		isUnread: boolean;
		branch: string;
		name: string;
	}>,
): void {
	const now = Date.now();
	localDb
		.update(workspaces)
		.set({
			lastOpenedAt: now,
			updatedAt: now,
			...additionalFields,
		})
		.where(eq(workspaces.id, workspaceId))
		.run();
}

/** Hides workspace from queries immediately, before slow deletion operations. */
export function markWorkspaceAsDeleting(workspaceId: string): void {
	localDb
		.update(workspaces)
		.set({ deletingAt: Date.now() })
		.where(eq(workspaces.id, workspaceId))
		.run();
}

/** Restores workspace visibility after a failed deletion. */
export function clearWorkspaceDeletingStatus(workspaceId: string): void {
	localDb
		.update(workspaces)
		.set({ deletingAt: null })
		.where(eq(workspaces.id, workspaceId))
		.run();
}

/**
 * Delete a workspace record from the database.
 */
export function deleteWorkspace(workspaceId: string): void {
	localDb.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
}

/**
 * Delete a worktree record from the database.
 */
export function deleteWorktreeRecord(worktreeId: string): void {
	localDb.delete(worktrees).where(eq(worktrees.id, worktreeId)).run();
}

/**
 * Get the branch workspace for a project (excluding those being deleted).
 * Each project can only have one branch workspace (type='branch').
 * Returns undefined if no branch workspace exists.
 */
export function getBranchWorkspace(
	projectId: string,
): SelectWorkspace | undefined {
	return localDb
		.select()
		.from(workspaces)
		.where(
			and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.type, "branch"),
				isNull(workspaces.deletingAt),
			),
		)
		.get();
}

/**
 * Update a project's default branch.
 */
export function updateProjectDefaultBranch(
	projectId: string,
	defaultBranch: string,
): void {
	localDb
		.update(projects)
		.set({ defaultBranch })
		.where(eq(projects.id, projectId))
		.run();
}

/**
 * Allocate a port base for a new workspace.
 * Finds the first available port range by checking for gaps in used port bases.
 * Deleted workspaces free up their port range for reuse.
 *
 * Each workspace gets a range of PORT_RANGE ports starting from the allocated base.
 * For example, with START_PORT=3000 and PORT_RANGE=10:
 * - First workspace: 3000 (uses 3000-3009)
 * - Second workspace: 3010 (uses 3010-3019)
 * - If first is deleted, third workspace: 3000 (reused)
 */
export function allocatePortBase(): number {
	const existing = localDb
		.select({ portBase: workspaces.portBase })
		.from(workspaces)
		.where(isNotNull(workspaces.portBase))
		.orderBy(asc(workspaces.portBase))
		.all();

	const usedBases = new Set(existing.map((w) => w.portBase));

	// Find first available slot
	let candidate = START_PORT;
	while (usedBases.has(candidate)) {
		candidate += PORT_RANGE;
	}

	return candidate;
}
