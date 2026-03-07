/**
 * Strips trailing slash and returns empty string for blank pages.
 * e.g. "https://github.com/" → "https://github.com"
 *      "about:blank"        → ""
 */
export function displayUrl(url: string): string {
	if (url === "about:blank") return "";
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Prepends "https://" when the input has no scheme, so bare hostnames
 * like "github.com" navigate correctly instead of being treated as
 * relative paths.
 */
export function normalizeUrl(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return trimmed;
	if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}
