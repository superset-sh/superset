import { join } from "node:path";
import { projects } from "@superset/local-db";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";
import { cleanupTombstones } from "../../lib/trpc/routers/workspaces/utils/git";
import { localDb } from "./local-db";

/**
 * Performs cleanup tasks on app startup.
 * Currently cleans up orphaned tombstone directories from failed workspace deletions.
 *
 * Runs in the background and does not block app startup.
 */
export async function runStartupCleanup(): Promise<void> {
	console.log("[startup] Starting background cleanup tasks...");

	try {
		// Get all projects from the database
		const allProjects = localDb.select().from(projects).all();

		if (allProjects.length === 0) {
			console.log("[startup] No projects found, skipping tombstone cleanup");
			return;
		}

		// Clean up tombstones for each project's worktrees directory
		const cleanupPromises = allProjects.map(async (project) => {
			const worktreesDir = join(
				project.mainRepoPath,
				SUPERSET_DIR_NAME,
				WORKTREES_DIR_NAME,
			);
			await cleanupTombstones(worktreesDir);
		});

		await Promise.all(cleanupPromises);

		console.log("[startup] Background cleanup tasks completed");
	} catch (error) {
		// Don't let cleanup failures affect app startup
		console.error("[startup] Cleanup failed:", error);
	}
}
