const GITHUB_AUTHOR_PATTERN =
	/^(?!.*--)[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?(?:\[bot\])?$/i;

export function normalizeAuthorFilter(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const login = value.trim().replace(/^@/, "");
	return GITHUB_AUTHOR_PATTERN.test(login) ? login : null;
}

/** Comma-separated logins keep saved filters and existing author URLs compatible.
 * Bound this singleton preference to 20 authors; GitHub logins are length-limited.
 */
export function normalizeAuthorFilters(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const authors = new Map<string, string>();
	for (const entry of value.split(",")) {
		const login = normalizeAuthorFilter(entry);
		if (!login) return null;
		const key = login.toLowerCase();
		if (!authors.has(key)) authors.set(key, login);
	}
	return [...authors.values()].slice(0, 20).join(",") || null;
}
