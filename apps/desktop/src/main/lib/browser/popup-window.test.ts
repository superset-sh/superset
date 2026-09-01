import { describe, expect, test } from "bun:test";
import {
	isBrowserPanePopup,
	isOAuthAuthorizationUrl,
	isPopupDisposition,
	markBrowserPanePopup,
	shouldOpenAsPopup,
} from "./popup-window";

describe("isPopupDisposition", () => {
	test("treats Chromium's popup disposition as a popup", () => {
		expect(isPopupDisposition("new-window")).toBe(true);
	});

	test("leaves link targets as tabs, so they still open as split panes", () => {
		expect(isPopupDisposition("foreground-tab")).toBe(false);
		expect(isPopupDisposition("background-tab")).toBe(false);
		expect(isPopupDisposition("default")).toBe(false);
		expect(isPopupDisposition("other")).toBe(false);
	});
});

describe("browser pane popup registry", () => {
	// The app-wide `web-contents-created` guard in electron-app/factories/app
	// sends http(s) `will-navigate` to the system browser. It consults this
	// registry so a pane's sign-in popup navigates in place instead of being
	// kicked out to Chrome, which would split the session across two browsers.
	const contents = () => ({}) as unknown as Electron.WebContents;

	test("an unmarked webContents is not a pane popup", () => {
		expect(isBrowserPanePopup(contents())).toBe(false);
	});

	test("a marked webContents is recognised", () => {
		const wc = contents();
		markBrowserPanePopup(wc);
		expect(isBrowserPanePopup(wc)).toBe(true);
	});

	test("marking one popup does not mark another", () => {
		const a = contents();
		const b = contents();
		markBrowserPanePopup(a);
		expect(isBrowserPanePopup(a)).toBe(true);
		expect(isBrowserPanePopup(b)).toBe(false);
	});
});

describe("isOAuthAuthorizationUrl", () => {
	// The exact parameter set Deel's "Sign in with Google" opens with, captured
	// from the running app. It arrives as `foreground-tab` with an empty
	// frameName and empty features, indistinguishable from a `_blank` link, so
	// the URL is the only signal left.
	const DEEL_GOOGLE =
		"https://accounts.google.com/o/oauth2/v2/auth?scope=email+profile&response_type=code&redirect_uri=https%3A%2F%2Fapp.deel.com%2Flogin%2Fgoogle&response_mode=query&prompt=select_account&client_id=x&state=y";

	test("recognises a real provider authorization request", () => {
		expect(isOAuthAuthorizationUrl(DEEL_GOOGLE)).toBe(true);
	});

	test("is provider-agnostic rather than a hostname allowlist", () => {
		expect(
			isOAuthAuthorizationUrl(
				"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=a&redirect_uri=b&response_type=code",
			),
		).toBe(true);
		expect(
			isOAuthAuthorizationUrl(
				"https://example.okta.com/oauth2/v1/authorize?client_id=a&redirect_uri=b&response_type=token",
			),
		).toBe(true);
	});

	test("an ordinary link is not an authorization request", () => {
		expect(isOAuthAuthorizationUrl("https://example.com/docs")).toBe(false);
		expect(isOAuthAuthorizationUrl("https://example.com/?client_id=a")).toBe(
			false,
		);
		expect(isOAuthAuthorizationUrl("not a url")).toBe(false);
		expect(isOAuthAuthorizationUrl("about:blank")).toBe(false);
	});
});

describe("shouldOpenAsPopup", () => {
	test("a Chromium popup disposition is enough on its own", () => {
		expect(
			shouldOpenAsPopup({
				disposition: "new-window",
				url: "https://example.com/anything",
			}),
		).toBe(true);
	});

	test("a bare window.open of a sign-in URL still becomes a popup", () => {
		// Deel's shape: no name, no features, so Chromium reports a tab.
		expect(
			shouldOpenAsPopup({
				disposition: "foreground-tab",
				url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=a&redirect_uri=b&response_type=code",
			}),
		).toBe(true);
	});

	test("an ordinary target=_blank link still opens as a split pane", () => {
		expect(
			shouldOpenAsPopup({
				disposition: "foreground-tab",
				url: "https://example.com/docs",
			}),
		).toBe(false);
	});
});

describe("blank popups (open-then-navigate auth libraries)", () => {
	test('a bare window.open("about:blank") is a popup, not a denied tab', () => {
		// No features, so Chromium reports a tab. Denying it would hand the
		// caller null, which reads as a blocked popup.
		expect(
			shouldOpenAsPopup({ disposition: "foreground-tab", url: "about:blank" }),
		).toBe(true);
	});

	test("still a popup when Chromium already calls it one", () => {
		expect(
			shouldOpenAsPopup({ disposition: "new-window", url: "about:blank" }),
		).toBe(true);
	});

	test("a fragment or query on about:blank does not lose the popup", () => {
		// Measured: matching the bare string exactly returned null to the caller
		// AND left an empty split pane behind.
		for (const url of [
			"about:blank#state=abc",
			"about:blank?x=1",
			"about:srcdoc",
		]) {
			expect(shouldOpenAsPopup({ disposition: "foreground-tab", url })).toBe(
				true,
			);
		}
	});
});

describe("isOAuthAuthorizationUrl: response_type value space", () => {
	const url = (rt: string) =>
		`https://idp.example.com/authorize?client_id=a&redirect_uri=b&response_type=${rt}`;

	test("accepts the defined single and hybrid response types", () => {
		for (const rt of [
			"code",
			"token",
			"id_token",
			"none",
			"code%20id_token",
			"token%20id_token",
			"token%20code%20id_token",
		]) {
			expect(isOAuthAuthorizationUrl(url(rt))).toBe(true);
		}
	});

	test("rejects invalid combinations and empty required values", () => {
		for (const rt of ["none%20code", "code%20code", "code%20unknown"]) {
			expect(isOAuthAuthorizationUrl(url(rt))).toBe(false);
		}
		expect(
			isOAuthAuthorizationUrl(
				"https://idp.example.com/authorize?client_id=&redirect_uri=b&response_type=code",
			),
		).toBe(false);
		expect(
			isOAuthAuthorizationUrl(
				"https://idp.example.com/authorize?client_id=a&redirect_uri=&response_type=code",
			),
		).toBe(false);
	});

	test("an unrelated URL carrying the same parameter names is not a sign-in", () => {
		// The false positive a presence-only check would have accepted.
		expect(isOAuthAuthorizationUrl(url("json"))).toBe(false);
		expect(
			isOAuthAuthorizationUrl(
				"https://example.com/report?client_id=a&redirect_uri=b&response_type=csv",
			),
		).toBe(false);
	});

	test("only http(s) URLs qualify", () => {
		expect(
			isOAuthAuthorizationUrl(
				"file:///tmp/x?client_id=a&redirect_uri=b&response_type=code",
			),
		).toBe(false);
	});
});
