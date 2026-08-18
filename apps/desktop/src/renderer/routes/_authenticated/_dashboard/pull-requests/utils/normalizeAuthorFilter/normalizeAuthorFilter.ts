const GITHUB_AUTHOR_PATTERN =
	/^(?!.*--)[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?(?:\[bot\])?$/i;

export function normalizeAuthorFilter(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const login = value.trim().replace(/^@/, "");
	return GITHUB_AUTHOR_PATTERN.test(login) ? login : null;
}
