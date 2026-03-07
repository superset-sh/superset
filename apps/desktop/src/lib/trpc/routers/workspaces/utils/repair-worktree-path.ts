import { existsSync, realpathSync } from "node:fs";
import { projects, type SelectWorktree, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { getBranchWorktreePath } from "./git";

/**
 * Attempts to repair a worktree's stored path when it no longer exists on disk.
 *
 * When a worktree directory is moved (e.g., via `git worktree move` or manual
 * unnesting), the path stored in the local database becomes stale. This function
 * queries `git worktree list` from the main repo to find the worktree's current
 * path by matching on branch name, then updates the database if a valid new path
 * is found.
 *
 * @returns The repaired path if successful, null otherwise
 */
export async function tryRepairWorktreePath(
	worktreeId: string,
): Promise<string | null> {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.id, worktreeId))
		.get();

	if (!worktree) return null;

	// If path already exists, no repair needed
	if (existsSync(worktree.path)) return worktree.path;

	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, worktree.projectId))
		.get();

	if (!project) return null;

	try {
		const actualPath = await getBranchWorktreePath({
			mainRepoPath: project.mainRepoPath,
			branch: worktree.branch,
		});

		if (!actualPath || !existsSync(actualPath)) return null;

		// Reject if the candidate resolves to the main repo path.
		// `git worktree list` includes the main worktree; if the branch
		// happens to be checked out there, we must not rebind this
		// worktree row to the main repo.
		// Use realpathSync to canonicalize symlinks (e.g. /var → /private/var on macOS).
		if (realpathSync(actualPath) === realpathSync(project.mainRepoPath))
			return null;

		// Path has changed - update the database
		if (actualPath !== worktree.path) {
			console.log(
				`[repair-worktree-path] Worktree path changed: "${worktree.path}" → "${actualPath}" (branch: ${worktree.branch})`,
			);
			localDb
				.update(worktrees)
				.set({ path: actualPath })
				.where(eq(worktrees.id, worktreeId))
				.run();
		}

		return actualPath;
	} catch (error) {
		console.warn(
			`[repair-worktree-path] Failed to repair path for worktree ${worktreeId}:`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

/**
 * Returns the current usable worktree path for a tracked worktree.
 *
 * If the stored path still exists, it is returned unchanged. Otherwise this
 * attempts the same branch-based repair flow used by terminal/git-status code.
 */
export async function resolveWorktreePathWithRepair(
	worktreeId: string,
): Promise<string | null> {
	const worktree = localDb
		.select({ path: worktrees.path })
		.from(worktrees)
		.where(eq(worktrees.id, worktreeId))
		.get();

	if (!worktree) return null;
	if (existsSync(worktree.path)) return worktree.path;

	return tryRepairWorktreePath(worktreeId);
}

export async function resolveTrackedWorktree(
	worktree: SelectWorktree,
): Promise<{
	worktree: SelectWorktree;
	existsOnDisk: boolean;
}> {
	const resolvedPath = await resolveWorktreePathWithRepair(worktree.id);

	if (!resolvedPath) {
		return {
			worktree,
			existsOnDisk: false,
		};
	}

	if (resolvedPath === worktree.path) {
		return {
			worktree,
			existsOnDisk: true,
		};
	}

	return {
		worktree: {
			...worktree,
			path: resolvedPath,
		},
		existsOnDisk: true,
	};
}

export async function listProjectWorktreesWithCurrentPaths(
	projectId: string,
): Promise<
	Array<{
		worktree: SelectWorktree;
		existsOnDisk: boolean;
	}>
> {
	const projectWorktrees = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.projectId, projectId))
		.all();

	return Promise.all(projectWorktrees.map(resolveTrackedWorktree));
}

export async function findProjectWorktreeByCurrentPath(
	projectId: string,
	worktreePath: string,
): Promise<SelectWorktree | null> {
	const trackedWorktrees =
		await listProjectWorktreesWithCurrentPaths(projectId);

	for (const trackedWorktree of trackedWorktrees) {
		if (!trackedWorktree.existsOnDisk) {
			continue;
		}

		if (trackedWorktree.worktree.path === worktreePath) {
			return trackedWorktree.worktree;
		}
	}

	return null;
}
