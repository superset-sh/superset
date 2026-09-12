const SEARCH_URL = "https://www.google.com/search?q=";

/**
 * The one place address-bar text and persisted pane URLs become a webview
 * URL. Always returns a parseable absolute URL: Electron parses a webview's
 * `src` with `new URL()` inside the element's connectedCallback, so a value
 * that merely gained a scheme (`git@github.com:org/repo.git` linkified in a
 * terminal, `https://` on its own, a non-numeric port) would throw from
 * `appendChild`. Such text is searched instead, like any other non-URL.
 */
export function sanitizeUrl(url: string): string {
	const value = url.trim();
	const candidate = withScheme(value);
	return URL.canParse(candidate) ? candidate : searchUrl(value);
}

function withScheme(value: string): string {
	if (/^https?:\/\//i.test(value) || value.startsWith("about:")) {
		return value;
	}
	if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value)) {
		return `http://${value}`;
	}
	if (/^[^\s/]+\.[^\s]+(\/.*)?$/.test(value)) {
		return `https://${value}`;
	}
	return searchUrl(value);
}

function searchUrl(value: string): string {
	return `${SEARCH_URL}${encodeURIComponent(value)}`;
}
