import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { getBranchBaseConfig } from "../../workspaces/utils/base-branch-config";
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

export async function getWorktreeBaseBranch(
	worktreePath: string,
	currentBranch: string | null,
): Promise<string | null> {
	const { compareBaseBranch: configuredCompareBaseBranch } = currentBranch
		? await getBranchBaseConfig({
				repoPath: worktreePath,
				branch: currentBranch,
			})
		: { compareBaseBranch: null };
	const persistedWorktree = getPersistedWorktreeBaseBranch(worktreePath);
	const persistedBaseBranch =
		persistedWorktree &&
		(!currentBranch || persistedWorktree.branch === currentBranch)
			? (persistedWorktree.baseBranch?.trim() ?? null)
			: null;

	return configuredCompareBaseBranch ?? persistedBaseBranch;
}
