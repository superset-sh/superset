/** A pull request by its own identity: the repository it lives in and its number. */
export interface PullRequestRef {
	repoFullName: string;
	number: number;
	provider?: "gitlab";
	host?: string;
}

const PULL_REQUEST_URL =
	/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/;

export function pullRequestRefFromUrl(url: string): PullRequestRef | null {
	const match = PULL_REQUEST_URL.exec(url);
	if (match?.[1] && match[2]) {
		return { repoFullName: match[1], number: Number(match[2]) };
	}
	const gitlab =
		/^https:\/\/([^/?#]+)\/(.+?)\/-\/merge_requests\/([1-9]\d*)(?:[/?#]|$)/i.exec(
			url,
		);
	if (
		!gitlab?.[2] ||
		!gitlab[3] ||
		/[\s\\]/.test(url) ||
		/[%@]/.test(gitlab[1] ?? "")
	)
		return null;
	try {
		const parsed = new URL(url);
		if (parsed.username || parsed.password || parsed.hostname === "github.com")
			return null;
		const path = url
			.slice(url.indexOf("/", url.indexOf("://") + 3))
			.split(/[?#]/)[0];
		const segments = path?.split("/").slice(1).map(decodeURIComponent);
		if (
			!segments ||
			segments.some(
				(segment) =>
					segment === "." ||
					segment === ".." ||
					/[\s\\/:?#%@]/.test(segment) ||
					[...segment].some(
						(character) =>
							character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
					),
			)
		)
			return null;
		const repository = gitlab[2].split("/").map(decodeURIComponent);
		const number = Number(gitlab[3]);
		if (
			repository.length < 2 ||
			repository.some((part) => !part) ||
			!Number.isSafeInteger(number)
		)
			return null;
		return {
			repoFullName: repository.join("/"),
			number,
			provider: "gitlab",
			host: parsed.host.toLowerCase(),
		};
	} catch {
		return null;
	}
}

export function isSamePullRequest(
	left: PullRequestRef,
	right: PullRequestRef,
): boolean {
	if (left.provider === "gitlab" || right.provider === "gitlab") {
		return (
			left.provider === right.provider &&
			!!left.host &&
			!!right.host &&
			left.host.toLowerCase() === right.host.toLowerCase() &&
			left.repoFullName === right.repoFullName &&
			left.number === right.number
		);
	}
	return (
		left.number === right.number &&
		left.repoFullName.toLowerCase() === right.repoFullName.toLowerCase()
	);
}

export class PullRequestIdentityError extends Error {}
