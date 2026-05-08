import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_SUPERSET_DIR_NAME = ".superset";

/**
 * `git worktree add` skips gitignored files, so a project that keeps its
 * `.superset/` directory out of source control (a common pattern, and the
 * one v1 supported) ends up with a worktree that has no setup config at
 * all. Copy from the main repo on creation so `bash ./.superset/setup.sh`
 * and friends keep working in the new worktree. No-op when the source
 * is missing or the destination already exists.
 */
export function copySupersetDirToWorktree(
	mainRepoPath: string,
	worktreePath: string,
): void {
	const source = join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME);
	const dest = join(worktreePath, PROJECT_SUPERSET_DIR_NAME);
	if (!existsSync(source) || existsSync(dest)) return;
	try {
		cpSync(source, dest, { recursive: true });
	} catch (error) {
		console.error(
			`[copySupersetDirToWorktree] failed to copy ${source} → ${dest}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
