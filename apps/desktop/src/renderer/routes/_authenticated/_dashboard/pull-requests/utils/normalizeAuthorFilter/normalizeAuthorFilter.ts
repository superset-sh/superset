const GITHUB_AUTHOR_PATTERN =
	/^(?!.*--)[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?(?:\[bot\])?$/i;

export function normalizeAuthorFilter(
	value: unknown,
	provider: "github" | "gitlab" | "mixed" | "unknown" = "github",
): string | null {
	if (typeof value !== "string") return null;
	const raw = value.trim();
	const login = raw.replace(/^@/, "");
	if (provider === "gitlab" || provider === "unknown") {
		if (raw === "@me") return raw;
		if (/^[a-z\d_.-]{1,255}$/i.test(login)) return login;
		if (provider === "gitlab") return null;
	}
	if (provider === "mixed" && !/^[a-z\d_.-]{1,255}$/i.test(login)) return null;
	return GITHUB_AUTHOR_PATTERN.test(login) ? login : null;
}

/** Comma-separated logins keep saved filters and existing author URLs compatible.
 * Bound this singleton preference to 20 authors; GitHub logins are length-limited.
 */
export function normalizeAuthorFilters(
	value: unknown,
	provider: "github" | "gitlab" | "mixed" | "unknown" = "github",
): string | null {
	if (typeof value !== "string") return null;
	const authors = new Map<string, string>();
	for (const entry of value.split(",")) {
		const login = normalizeAuthorFilter(entry, provider);
		if (!login) return null;
		const key = login.toLowerCase();
		if (!authors.has(key)) authors.set(key, login);
	}
	return [...authors.values()].slice(0, 20).join(",") || null;
}
