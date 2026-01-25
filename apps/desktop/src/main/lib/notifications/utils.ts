/**
 * Extracts the workspace ID from a hash-routed URL.
 *
 * The app uses hash routing, so URLs look like:
 * - file:///path/to/app/index.html#/workspace/abc123
 * - file:///Users/foo/workspace/superset/dist/index.html#/workspace/abc123?foo=bar
 *
 * This function parses the hash portion to avoid matching /workspace/ in the file path.
 */
export function extractWorkspaceIdFromUrl(url: string): string | null {
	try {
		const hash = new URL(url).hash;
		const match = hash.match(/\/workspace\/([^/?#]+)/);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}
