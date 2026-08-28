export interface ParsedGithubPullRequestUrl {
	owner: string;
	repo: string;
	number: number;
}

// Postgres integer column ceiling; a "PR number" past it is not a real PR.
const MAX_PR_NUMBER = 2_147_483_647;

/**
 * Parses `https://github.com/<owner>/<repo>/pull/<number>` into the triple
 * that identifies the PR. Tolerates a trailing slash, query string, fragment,
 * and PR sub-tab suffixes (`/files`, `/commits`, …) — all of those still name
 * the same PR. Returns null (never throws) for anything else, including
 * non-github.com hosts.
 *
 * `owner` and `repo` come back lowercased: GitHub treats both
 * case-insensitively, and every consumer of this triple uses it as a matching
 * identity — the original URL string is what you display.
 */
export function parseGithubPullRequestUrl(
	url: string,
): ParsedGithubPullRequestUrl | null {
	let parsed: URL;
	try {
		parsed = new URL(url.trim());
	} catch {
		return null;
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
	const host = parsed.hostname.toLowerCase();
	if (host !== "github.com" && host !== "www.github.com") return null;

	const match =
		/^\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)(?:\/.*)?$/.exec(
			parsed.pathname,
		);
	if (!match?.[1] || !match[2] || !match[3]) return null;

	const number = Number(match[3]);
	if (!Number.isSafeInteger(number) || number < 1 || number > MAX_PR_NUMBER) {
		return null;
	}

	return {
		owner: match[1].toLowerCase(),
		repo: match[2].toLowerCase(),
		number,
	};
}
