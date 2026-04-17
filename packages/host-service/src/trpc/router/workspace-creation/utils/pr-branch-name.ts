/**
 * Derive the local branch name for a PR workspace.
 *
 * Same-repo PRs use the head ref as-is. Cross-repo (fork) PRs get the
 * fork owner as a lowercase prefix — avoids collisions with local/upstream
 * branches of the same name and namespaces by author.
 *
 * Mirrors v1 (`apps/desktop/src/lib/trpc/routers/workspaces/utils/git.ts:1630`).
 */
export function derivePrLocalBranchName(pr: {
	headRefName: string;
	headRepositoryOwner: string;
	isCrossRepository: boolean;
}): string {
	const headRef = pr.headRefName.trim();
	if (!headRef) {
		throw new Error("derivePrLocalBranchName: headRefName is required");
	}
	if (pr.isCrossRepository) {
		const owner = pr.headRepositoryOwner.trim().toLowerCase();
		if (!owner) {
			throw new Error(
				"derivePrLocalBranchName: headRepositoryOwner is required for cross-repo PRs",
			);
		}
		return `${owner}/${headRef}`;
	}
	return headRef;
}
