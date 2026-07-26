import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { getBranchBaseConfig } from "../../workspaces/utils/base-branch-config";
import {
	type PersistedWorktreeBaseBranch,
	selectEffectiveBaseBranch,
} from "./select-effective-base-branch";

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

	return selectEffectiveBaseBranch({
		configuredBaseBranch: configuredCompareBaseBranch,
		persistedWorktree: getPersistedWorktreeBaseBranch(worktreePath),
		currentBranch,
		defaultBranch: null,
	});
}
