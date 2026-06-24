export type GitHubEntityKind = "pull" | "issue";

export interface NormalizedQuery {
	query: string;
	repoMismatch: boolean;
	/** When true, `query` is a number and should use direct lookup, not text search. */
	isDirectLookup: boolean;
}

// Matches both /pull/123 and /issues/123
const GITHUB_URL_RE =
	/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)(?:[/?#].*)?$/i;

/**
 * Normalize raw search input for GitHub PR or issue search endpoints.
 *
 * Handles:
 * - Full GitHub URL → extract number, validate entity kind and repo
 * - `#123` shorthand → strip `#`, direct lookup by number
 * - Bare number `123` → direct lookup by number
 * - Plain text → pass through for text search
 */
export function normalizeGitHubQuery(
	raw: string,
	repo: { owner: string; name: string },
	kind: GitHubEntityKind,
): NormalizedQuery {
	if (!raw) return { query: "", repoMismatch: false, isDirectLookup: false };

	// Full GitHub URL
	const urlMatch = raw.match(GITHUB_URL_RE);
	if (urlMatch) {
		const urlOwner = urlMatch[1] as string;
		const urlRepo = urlMatch[2] as string;
		const urlPath = (urlMatch[3] as string).toLowerCase(); // "pull" or "issues"
		const number = urlMatch[4] as string;

		// Wrong entity type (e.g. issue URL pasted in PR search) — fall through to text search
		const urlEntityKind: GitHubEntityKind =
			urlPath === "pull" ? "pull" : "issue";
		if (urlEntityKind !== kind) {
			return { query: raw, repoMismatch: false, isDirectLookup: false };
		}

		const isSameRepo =
			urlOwner.toLowerCase() === repo.owner.toLowerCase() &&
			urlRepo.toLowerCase() === repo.name.toLowerCase();
		return {
			query: isSameRepo ? number : "",
			repoMismatch: !isSameRepo,
			isDirectLookup: isSameRepo,
		};
	}

	// `#123` shorthand — strip the `#`, direct lookup by number
	if (/^#\d+$/.test(raw)) {
		return { query: raw.slice(1), repoMismatch: false, isDirectLookup: true };
	}

	// Bare number — direct lookup
	if (/^\d+$/.test(raw)) {
		return { query: raw, repoMismatch: false, isDirectLookup: true };
	}

	return { query: raw, repoMismatch: false, isDirectLookup: false };
}
