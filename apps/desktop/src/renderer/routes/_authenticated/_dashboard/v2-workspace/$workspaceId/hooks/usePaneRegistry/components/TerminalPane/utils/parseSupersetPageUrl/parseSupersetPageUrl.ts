export function parseSupersetPageUrl(
	url: string,
	webUrl: string,
): string | null {
	let parsed: URL;
	let web: URL;
	try {
		parsed = new URL(url);
		web = new URL(webUrl);
	} catch {
		return null;
	}

	if (parsed.origin !== web.origin) return null;

	const segments = parsed.pathname.split("/").filter(Boolean);
	if (segments.length !== 2 || segments[0] !== "page") return null;

	const slug = segments[1];
	if (!slug) return null;

	try {
		return decodeURIComponent(slug);
	} catch {
		return slug;
	}
}
