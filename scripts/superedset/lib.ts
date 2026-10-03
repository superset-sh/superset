export interface PullRequest {
	number: number;
	title: string;
	headRefName: string;
	headRefOid: string;
	createdAt: string;
	url: string;
	commits: { oid: string }[];
}

export interface GitHubRelease {
	tag_name: string;
	draft: boolean;
	prerelease: boolean;
}

export function stableDesktopReleaseTag(releases: GitHubRelease[]): string {
	const release = releases.find(
		({ draft, prerelease, tag_name }) =>
			!draft && !prerelease && tag_name.startsWith("desktop-v"),
	);
	if (!release) throw new Error("No stable desktop release found");

	return release.tag_name;
}

export function validatePullRequests(
	pullRequests: PullRequest[],
): PullRequest[] {
	for (const pullRequest of pullRequests) {
		if (pullRequest.commits.length !== 1) {
			throw new Error(
				`PR #${pullRequest.number} has ${pullRequest.commits.length} commits; squash it to one commit first`,
			);
		}
		if (pullRequest.commits[0]?.oid !== pullRequest.headRefOid) {
			throw new Error(
				`PR #${pullRequest.number} head does not match its commit`,
			);
		}
	}

	return pullRequests.toSorted((left, right) =>
		left.createdAt.localeCompare(right.createdAt),
	);
}
