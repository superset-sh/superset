/** A pull request by its own identity: the repository it lives in and its number. */
export interface PullRequestRef {
	repoFullName: string;
	host?: string;
	number: number;
}

const PULL_REQUEST_URL =
	/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/;

export function pullRequestRefFromUrl(url: string): PullRequestRef | null {
	const match = PULL_REQUEST_URL.exec(url);
	if (!match?.[1] || !match[2]) {
		if (!URL.canParse(url)) return null;
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return null;
		const gitlab = /^\/(.+\/.+)\/-\/merge_requests\/(\d+)(?:\/|$)/.exec(
			parsed.pathname,
		);
		if (!gitlab?.[1] || !gitlab[2]) return null;
		return {
			repoFullName: gitlab[1],
			host: parsed.host,
			number: Number(gitlab[2]),
		};
	}
	return { repoFullName: match[1], number: Number(match[2]) };
}

export function isSamePullRequest(
	left: PullRequestRef,
	right: PullRequestRef,
): boolean {
	return (
		left.number === right.number &&
		(left.host ?? "github.com").toLowerCase() ===
			(right.host ?? "github.com").toLowerCase() &&
		left.repoFullName.toLowerCase() === right.repoFullName.toLowerCase()
	);
}
