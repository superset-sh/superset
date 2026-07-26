export interface PersistedWorktreeBaseBranch {
	branch: string;
	baseBranch: string | null;
}

interface SelectEffectiveBaseBranchOptions {
	configuredBaseBranch: string | null;
	persistedWorktree: PersistedWorktreeBaseBranch | null;
	currentBranch: string | null;
	defaultBranch: string | null;
}

export function selectEffectiveBaseBranch({
	configuredBaseBranch,
	persistedWorktree,
	currentBranch,
	defaultBranch,
}: SelectEffectiveBaseBranchOptions): string | null {
	const persistedBaseBranch =
		persistedWorktree &&
		(!currentBranch || persistedWorktree.branch === currentBranch)
			? (persistedWorktree.baseBranch?.trim() ?? null)
			: null;

	return configuredBaseBranch ?? persistedBaseBranch ?? defaultBranch;
}
