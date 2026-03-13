import { homedir } from "node:os";
import { join } from "node:path";
import { type SelectProject, settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";

const PROJECT_LOCAL_WORKTREES_DIR = ".worktrees";

/** Resolves base dir: project override > project-local toggle > global setting > default (~/.superset/worktrees) */
export function resolveWorktreePath(
	project: Pick<SelectProject, "name" | "worktreeBaseDir" | "mainRepoPath">,
	branch: string,
): string {
	if (project.worktreeBaseDir) {
		return join(project.worktreeBaseDir, project.name, branch);
	}

	const row = localDb.select().from(settings).get();

	if (row?.useProjectLocalWorktrees) {
		return join(project.mainRepoPath, PROJECT_LOCAL_WORKTREES_DIR, branch);
	}

	const baseDir =
		row?.worktreeBaseDir ??
		join(homedir(), SUPERSET_DIR_NAME, WORKTREES_DIR_NAME);

	return join(baseDir, project.name, branch);
}
