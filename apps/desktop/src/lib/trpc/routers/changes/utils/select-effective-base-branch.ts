export function selectEffectiveBaseBranch(
	worktreeBaseBranch: string | null,
	defaultBranch: string,
): string {
	return worktreeBaseBranch ?? defaultBranch;
}
