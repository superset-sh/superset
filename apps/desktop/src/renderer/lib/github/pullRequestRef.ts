/** A pull request by its own identity: the repository it lives in and its number. */
export interface PullRequestRef {
	repoFullName: string;
	number: number;
}

const PULL_REQUEST_URL =
	/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/;

export function pullRequestRefFromUrl(url: string): PullRequestRef | null {
	const match = PULL_REQUEST_URL.exec(url);
	if (!match?.[1] || !match[2]) return null;
	return { repoFullName: match[1], number: Number(match[2]) };
}

export function isSamePullRequest(
	left: PullRequestRef,
	right: PullRequestRef,
): boolean {
	return (
		left.number === right.number &&
		left.repoFullName.toLowerCase() === right.repoFullName.toLowerCase()
	);
}
