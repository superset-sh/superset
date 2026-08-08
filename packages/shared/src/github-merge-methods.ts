export const GITHUB_MERGE_METHODS = ["squash", "merge", "rebase"] as const;

export type GitHubMergeMethod = (typeof GITHUB_MERGE_METHODS)[number];

export interface GitHubMergeCapabilities {
	allowMergeCommit?: boolean | null;
	allowRebaseMerge?: boolean | null;
	allowSquashMerge?: boolean | null;
}

export interface GitHubRestMergeCapabilities {
	allow_merge_commit?: boolean | null;
	allow_rebase_merge?: boolean | null;
	allow_squash_merge?: boolean | null;
}

export function normalizeGitHubRestMergeCapabilities(
	capabilities: GitHubRestMergeCapabilities | null | undefined,
): GitHubMergeCapabilities | null {
	if (!capabilities) return null;

	return {
		allowMergeCommit: capabilities.allow_merge_commit,
		allowRebaseMerge: capabilities.allow_rebase_merge,
		allowSquashMerge: capabilities.allow_squash_merge,
	};
}

export function isGitHubMergeMethodDisabled(
	capabilities: GitHubMergeCapabilities | null | undefined,
	method: GitHubMergeMethod,
): boolean {
	switch (method) {
		case "merge":
			return capabilities?.allowMergeCommit === false;
		case "rebase":
			return capabilities?.allowRebaseMerge === false;
		case "squash":
			return capabilities?.allowSquashMerge === false;
	}
}
