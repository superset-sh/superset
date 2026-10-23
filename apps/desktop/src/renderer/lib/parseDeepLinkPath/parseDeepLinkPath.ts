export function parseDeepLinkPath(path: string): {
	to: string;
	search: Record<string, string>;
} {
	const { pathname, searchParams } = new URL(path, "http://deep-link.local");
	return { to: pathname, search: Object.fromEntries(searchParams) };
}
