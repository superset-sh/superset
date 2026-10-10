const GITHUB_PROFILE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i;

/** `https://github.com/Foo/`, `github.com/foo?tab=repos` and `foo` all give `foo`. */
export function githubHandle(value: string): string | null {
	const trimmed = value.trim();
	const match = GITHUB_PROFILE.exec(trimmed);
	const handle = match ? match[1] : /^[\w-]+$/.test(trimmed) ? trimmed : null;
	return handle ? handle.toLowerCase() : null;
}

/**
 * Postgres twin of `githubHandle`: reduces a stored profile URL to its handle
 * and leaves anything else (a bare handle, another site) as it is.
 */
export const GITHUB_PROFILE_SQL_PATTERN =
	"^(https?://)?(www\\.)?github\\.com/([^/?#[:space:]]+).*$";
