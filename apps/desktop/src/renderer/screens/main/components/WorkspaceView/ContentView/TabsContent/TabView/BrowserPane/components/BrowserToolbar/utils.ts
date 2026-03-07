/**
 * Strips trailing slash and returns empty string for blank pages.
 * e.g. "https://github.com/" → "https://github.com"
 *      "about:blank"        → ""
 */
export function displayUrl(url: string): string {
	if (url === "about:blank") return "";
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Extract the bare hostname from a schemeless input like `localhost:3000/path`. */
function extractHost(input: string): string {
	if (input.startsWith("[")) return "[::1]"; // IPv6
	return input.split("/")[0].split(":")[0];
}

/**
 * Prepends a scheme when the input has none, matching Chrome/Firefox behavior:
 * - localhost / 127.0.0.1 / [::1] get `http://` (local dev servers rarely use TLS)
 * - All other bare hostnames get `https://`
 * - Inputs that already have any scheme (`https://`, `http://`, `about:`, `data:`, etc.)
 *   pass through unchanged.
 */
export function normalizeUrl(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return trimmed;

	// Already has a scheme (`scheme:` or `scheme://`).
	// Exception: `localhost:port` looks like a scheme but is a host:port pair.
	if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
		const potentialHost = trimmed.split(":")[0];
		if (!LOCALHOST_HOSTS.has(potentialHost)) return trimmed;
	}

	const scheme = LOCALHOST_HOSTS.has(extractHost(trimmed)) ? "http" : "https";
	return `${scheme}://${trimmed}`;
}
