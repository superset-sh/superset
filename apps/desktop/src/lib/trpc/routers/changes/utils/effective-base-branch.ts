import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { PersistedWorktreeBaseBranch } from "./select-effective-base-branch";

export function getPersistedWorktreeBaseBranch(
	worktreePath: string,
): PersistedWorktreeBaseBranch | null {
	return (
		localDb
			.select({
				branch: worktrees.branch,
				baseBranch: worktrees.baseBranch,
			})
			.from(worktrees)
			.where(eq(worktrees.path, worktreePath))
			.get() ?? null
	);
}
