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
