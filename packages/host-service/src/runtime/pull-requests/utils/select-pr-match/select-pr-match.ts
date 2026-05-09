import type { GraphQLPullRequestNode } from "../github-query/types";

export interface SelectPullRequestMatchesInput {
	nodes: GraphQLPullRequestNode[];
	wantedKeys: Set<string>;
	defaultBranch: string | null;
}

// GitHub owner/repo are case-insensitive; branch names are case-sensitive.
function upstreamKey(
	owner: string | null,
	repo: string | null,
	branch: string,
): string | null {
	if (!owner || !repo) return null;
	return `${owner.toLowerCase()}/${repo.toLowerCase()}#${branch}`;
}

/**
 * Picks the latest-updated PR per upstream key from a flat list of repo PRs.
 *
 * Skips PRs whose `headRefName` equals the repository's default branch
 * (`defaultBranch`). A PR like `head=main → base=feature-x` shares the same
 * head-key as the local `main` workspace's upstream, so the naive
 * "head-key match" rule would attach that PR (often MERGED) to the main
 * workspace and surface it as "main has a merged PR." See issue #4260.
 */
export function selectPullRequestMatches(
	input: SelectPullRequestMatchesInput,
): Map<string, GraphQLPullRequestNode> {
	const { nodes, wantedKeys, defaultBranch } = input;
	const latestByKey = new Map<string, GraphQLPullRequestNode>();

	for (const node of nodes) {
		if (defaultBranch && node.headRefName === defaultBranch) continue;

		const key = upstreamKey(
			node.headRepositoryOwner?.login ?? null,
			node.headRepository?.name ?? null,
			node.headRefName,
		);
		if (!key || !wantedKeys.has(key)) continue;

		const existing = latestByKey.get(key);
		if (
			!existing ||
			new Date(node.updatedAt).getTime() >
				new Date(existing.updatedAt).getTime()
		) {
			latestByKey.set(key, node);
		}
	}

	return latestByKey;
}
