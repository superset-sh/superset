const GITHUB_PR_URL_RE =
	/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i;

export interface NormalizedQuery {
	query: string;
	repoMismatch: boolean;
	/** When true, `query` is a PR number and should use direct lookup, not text search. */
	isDirectLookup: boolean;
}

/**
 * Normalize raw search input for the pull request search endpoint.
 *
 * Handles:
 * - Full GitHub PR URL → extract PR number, validate against project repo
 * - `#123` shorthand → strip `#`, direct lookup by number
 * - Bare number `123` → direct lookup by number
 * - Plain text → pass through for text search
 */
export function normalizePullRequestQuery(
	raw: string,
	repo: { owner: string; name: string },
): NormalizedQuery {
	if (!raw) return { query: "", repoMismatch: false, isDirectLookup: false };

	// Full GitHub PR URL
	const urlMatch = raw.match(GITHUB_PR_URL_RE);
	if (urlMatch) {
		const urlOwner = urlMatch[1] as string;
		const urlRepo = urlMatch[2] as string;
		const prNumber = urlMatch[3] as string;
		const isSameRepo =
			urlOwner.toLowerCase() === repo.owner.toLowerCase() &&
			urlRepo.toLowerCase() === repo.name.toLowerCase();
		return {
			query: isSameRepo ? prNumber : "",
			repoMismatch: !isSameRepo,
			isDirectLookup: isSameRepo,
		};
	}

	// `#123` shorthand — strip the `#`, direct lookup by number
	if (/^#\d+$/.test(raw)) {
		return { query: raw.slice(1), repoMismatch: false, isDirectLookup: true };
	}

	// Bare number — direct lookup (user likely means a PR number)
	if (/^\d+$/.test(raw)) {
		return { query: raw, repoMismatch: false, isDirectLookup: true };
	}

	return { query: raw, repoMismatch: false, isDirectLookup: false };
}
