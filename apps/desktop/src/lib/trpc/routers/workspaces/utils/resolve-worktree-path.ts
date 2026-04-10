import { join } from "node:path";
import { type SelectProject, settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { getDefaultWorktreeBaseDir } from "./default-worktree-base-dir";

/** Resolves base dir: project override > global setting > default (~/.superset/worktrees) */
export function resolveWorktreePath(
	project: Pick<SelectProject, "name" | "worktreeBaseDir">,
	branch: string,
): string {
	if (project.worktreeBaseDir) {
		return join(project.worktreeBaseDir, project.name, branch);
	}

	const row = localDb.select().from(settings).get();
	const baseDir = row?.worktreeBaseDir ?? getDefaultWorktreeBaseDir();

	return join(baseDir, project.name, branch);
}
