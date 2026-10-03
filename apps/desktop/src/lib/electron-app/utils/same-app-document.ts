/**
 * Whether a top-level navigation stays on the document an app window already
 * shows — a reload, or a search/hash change of the same page. Anything else
 * (another `file:` path, `javascript:`, a custom scheme, a different origin)
 * must not replace the app UI: the new page would run with the app's
 * preload bridge, and with it the whole tRPC surface.
 */
export function isSameAppDocument(
	currentUrl: string,
	targetUrl: string,
): boolean {
	let current: URL;
	let target: URL;
	try {
		current = new URL(currentUrl);
		target = new URL(targetUrl);
	} catch {
		return false;
	}
	if (current.protocol !== target.protocol) return false;
	if (target.protocol === "file:") {
		return current.pathname === target.pathname;
	}
	return (
		current.origin === target.origin && current.pathname === target.pathname
	);
}
