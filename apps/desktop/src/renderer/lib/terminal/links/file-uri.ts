/**
 * Path from a `file://` URI, or null for anything else.
 *
 * Agent CLIs hyperlink attachments they wrote to disk — Claude Code emits
 * `file:///Users/me/.claude/image-cache/<session>/22.png` on the `[Image #22]`
 * it prints. Those arrive as OSC 8 links, so the terminal gets a real path and
 * can open it like any other file.
 */
export function fileUriToPath(uri: string): string | null {
	if (!uri.toLowerCase().startsWith("file://")) return null;
	try {
		const url = new URL(uri);
		// A host component means a UNC path (file://server/share); everything the
		// agents emit is local, and decodeURIComponent would silently drop it.
		if (url.hostname && url.hostname !== "localhost") return null;
		const path = decodeURIComponent(url.pathname);
		return path.length > 0 ? path : null;
	} catch {
		return null;
	}
}
