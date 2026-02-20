import { homedir } from "node:os";
import { join } from "node:path";
import { type SelectProject, settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";

/**
 * Resolves the worktree path for a given project and branch.
 *
 * Resolution chain:
 * 1. project.worktreeBaseDir (per-project override)
 * 2. settings.worktreeBaseDir (global default)
 * 3. join(homedir(), SUPERSET_DIR_NAME, WORKTREES_DIR_NAME) (hardcoded default)
 *
 * Appends /{project.name}/{branch} to the resolved base.
 */
export function resolveWorktreePath(
	project: Pick<SelectProject, "name" | "worktreeBaseDir">,
	branch: string,
): string {
	let baseDir: string;

	if (project.worktreeBaseDir) {
		baseDir = project.worktreeBaseDir;
	} else {
		const row = localDb.select().from(settings).get();
		if (row?.worktreeBaseDir) {
			baseDir = row.worktreeBaseDir;
		} else {
			baseDir = join(homedir(), SUPERSET_DIR_NAME, WORKTREES_DIR_NAME);
		}
	}

	return join(baseDir, project.name, branch);
}
