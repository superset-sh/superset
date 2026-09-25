export interface PullRequestLink {
	owner: string;
	repo: string;
	pullNumber: number;
}

/**
 * The pull request a github.com link points at: the PR itself or any of its
 * tabs, comments and review threads (they all belong to that one PR).
 */
export function pullRequestFromUrl(url: string): PullRequestLink | null {
	let target: URL;
	try {
		target = new URL(url);
	} catch {
		return null;
	}
	if (target.protocol !== "https:" || target.hostname !== "github.com") {
		return null;
	}

	const [owner, repo, kind, number] = target.pathname
		.split("/")
		.filter(Boolean);
	if (!owner || !repo || kind !== "pull" || !number || !/^\d+$/.test(number)) {
		return null;
	}
	return { owner, repo, pullNumber: Number.parseInt(number, 10) };
}
