/**
 * Classification for a guest pane's `window.open`.
 *
 * Chromium decides the disposition itself: a scripted `window.open(url, name,
 * "width=…,height=…")` is a popup (`new-window`), while a `target="_blank"`
 * link is a tab (`foreground-tab`/`background-tab`). We keep tabs as split
 * panes and let popups stay real popups — see `resolveWindowOpen` in
 * browser-manager.
 */
export function isPopupDisposition(
	disposition: Electron.HandlerDetails["disposition"],
): boolean {
	return disposition === "new-window";
}

/**
 * An OAuth 2.0 / OpenID Connect authorization request (RFC 6749 section 4.1.1).
 *
 * Needed because Chromium cannot tell us the thing we actually want to know.
 * Measured in Electron 41: a scripted `window.open(url)` with no name and no
 * features, and a plain `<a target="_blank">` click, arrive *identically* —
 * disposition `foreground-tab`, empty `frameName`, empty `features`. Sites that
 * open sign-in that way (Deel does) would otherwise land in a split pane, lose
 * `window.opener`, and never complete the handshake.
 *
 * Keyed on the parameters every authorization endpoint carries rather than a
 * list of provider hostnames, so it covers any identity provider without a
 * vendor allowlist to maintain. A `target="_blank"` link to an ordinary page
 * has none of these, so the split-pane path keeps that traffic.
 */
export function isOAuthAuthorizationUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
	const params = parsed.searchParams;
	return (
		Boolean(params.get("client_id")?.trim()) &&
		Boolean(params.get("redirect_uri")?.trim()) &&
		hasAuthorizationResponseType(params)
	);
}

/**
 * `response_type` restricted to the values the specs actually define (RFC 6749
 * section 3.1.1, plus the OIDC hybrid combinations, which are space-delimited
 * and order-independent). Checking the value space rather than merely the
 * parameter's presence keeps an unrelated URL that happens to carry these three
 * parameter names on the split-pane path, without resorting to a list of
 * provider hostnames that would go stale and would miss self-hosted identity
 * providers.
 */
const AUTHORIZATION_RESPONSE_TYPES = new Set([
	"code",
	"id_token",
	"none",
	"token",
	"code id_token",
	"code token",
	"id_token token",
	"code id_token token",
]);

function hasAuthorizationResponseType(params: URLSearchParams): boolean {
	const raw = params.get("response_type")?.trim();
	if (!raw) return false;
	const values = raw.split(/\s+/);
	if (new Set(values).size !== values.length) return false;
	return AUTHORIZATION_RESPONSE_TYPES.has(values.sort().join(" "));
}

/**
 * `window.open("about:blank")`, then assigning `location` once the request is
 * ready, is how several auth libraries dodge popup blockers. Chromium reports
 * it as a tab when no features are passed, so without this it would be denied
 * and `window.open` would hand the page `null` — indistinguishable, to the
 * caller, from a blocked popup.
 */
function isBlankPopupUrl(url: string): boolean {
	try {
		// Any `about:` URL, not just the bare string: `about:blank#state` is a
		// real pattern (libraries stash handshake state in the fragment), and
		// matching exactly missed it, which both returned null to the caller and
		// left an empty split pane behind. Nothing under `about:` is worth a
		// pane, so routing the whole scheme here fixes both halves.
		return new URL(url).protocol === "about:";
	} catch {
		return false;
	}
}

/**
 * Whether a guest's `window.open` should become a real popup window rather than
 * a split pane: either Chromium already called it a popup, or it is a sign-in
 * handshake that cannot survive losing its opener.
 */
export function shouldOpenAsPopup(
	details: Pick<Electron.HandlerDetails, "disposition" | "url">,
): boolean {
	return (
		isPopupDisposition(details.disposition) ||
		isBlankPopupUrl(details.url) ||
		isOAuthAuthorizationUrl(details.url)
	);
}

/**
 * Popups opened from a browser pane.
 *
 * The app-wide `web-contents-created` guard sends any http(s) `will-navigate`
 * in a non-webview `webContents` to the system browser. A pane's popup is a
 * `BrowserWindow`, so it matches that rule — which would kick a "Sign in with
 * Google" window out to Chrome, stranding the session in a different browser's
 * cookie jar from the pane that started it (SUPER-1272). These popups must
 * navigate in place instead; that is the entire point of allowing them.
 *
 * A `WeakSet` so an entry dies with its `webContents`. Registration happens on
 * `did-create-window`, which Electron fires before the popup's first
 * `will-navigate`, so the guard always sees the mark in time.
 */
const panePopupContents = new WeakSet<Electron.WebContents>();

export function markBrowserPanePopup(contents: Electron.WebContents): void {
	panePopupContents.add(contents);
}

export function isBrowserPanePopup(contents: Electron.WebContents): boolean {
	return panePopupContents.has(contents);
}
