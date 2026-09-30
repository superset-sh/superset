const GITHUB_AUTHOR_PATTERN =
	/^(?!.*--)[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?(?:\[bot\])?$/i;
const GITLAB_AUTHOR_PATTERN = /^[a-z\d_.-]{1,255}$/i;

export function normalizeAuthorFilter(
	value: unknown,
	provider: "github" | "gitlab" | "mixed" = "github",
): string | null {
	if (typeof value !== "string") return null;
	const login = value.trim().replace(/^@/, "");
	return (provider === "github"
		? GITHUB_AUTHOR_PATTERN
		: GITLAB_AUTHOR_PATTERN
	).test(login)
		? login
		: null;
}

/** Comma-separated logins keep saved filters and existing author URLs compatible.
 * Bound this singleton preference to 20 authors; GitHub logins are length-limited.
 */
export function normalizeAuthorFilters(
	value: unknown,
	provider: "github" | "gitlab" | "mixed" = "github",
): string | null {
	if (typeof value !== "string") return null;
	const authors = new Map<string, string>();
	for (const entry of value.split(",")) {
		const login = normalizeAuthorFilter(entry, provider);
		if (!login) return null;
		const key = login.toLowerCase();
		if (!authors.has(key)) authors.set(key, login);
	}
	return (
		[...authors.values()].slice(0, provider === "gitlab" ? 1 : 20).join(",") ||
		null
	);
}
