const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i;

/**
 * Returns a local path for Markdown links that can be resolved by the workspace
 * host. Web URLs, page fragments, and protocol-relative URLs stay regular links.
 */
export function filePathFromMarkdownHref(
	href: string | undefined,
): string | null {
	if (!href) return null;

	const trimmed = href.trim();
	if (
		!trimmed ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("//") ||
		trimmed === "streamdown:incomplete-link"
	) {
		return null;
	}

	const isWindowsPath = WINDOWS_ABSOLUTE_PATH.test(trimmed);
	const isFileUri = /^file:\/\//i.test(trimmed);
	if (!isWindowsPath && !isFileUri && URI_SCHEME.test(trimmed)) {
		return null;
	}

	// A literal fragment belongs to the Markdown destination rather than the
	// filename. Real `#` characters in paths arrive percent-encoded and survive.
	const withoutFragment = trimmed.split("#", 1)[0];
	if (!withoutFragment) return null;

	try {
		return decodeURIComponent(withoutFragment);
	} catch {
		return withoutFragment;
	}
}
