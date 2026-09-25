export function pageSlugFromUrl(url: string, webUrl: string): string | null {
	let target: URL;
	let web: URL;
	try {
		target = new URL(url);
		web = new URL(webUrl);
	} catch {
		return null;
	}
	if (target.origin !== web.origin) return null;

	const segments = target.pathname.split("/").filter(Boolean);
	if (segments.length !== 2 || segments[0] !== "page") return null;
	return segments[1] ?? null;
}
