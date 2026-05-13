import { describe, expect, test } from "bun:test";
import {
	isGoogleOAuthUrl,
	stripElectronFromUserAgent,
} from "./webview-user-agent";

// Reproduces #3665: Google blocks OAuth inside embedded Electron webviews
// when the User-Agent contains "Electron/*" and returns the
// `disallowed_useragent` error ("This browser or app may not be secure"),
// so clicking "Sign in with Google" on a site like x.com opened in the
// in-app browser pane fails.

describe("isGoogleOAuthUrl", () => {
	test("matches accounts.google.com OAuth paths", () => {
		expect(isGoogleOAuthUrl("https://accounts.google.com/")).toBe(true);
		expect(
			isGoogleOAuthUrl(
				"https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
			),
		).toBe(true);
		expect(
			isGoogleOAuthUrl("https://accounts.google.com/signin/v2/identifier"),
		).toBe(true);
	});

	test("matches accounts.youtube.com (shares Google sign-in)", () => {
		expect(isGoogleOAuthUrl("https://accounts.youtube.com/")).toBe(true);
	});

	test("is case-insensitive on hostname", () => {
		expect(isGoogleOAuthUrl("https://ACCOUNTS.GOOGLE.COM/")).toBe(true);
	});

	test("does not match unrelated Google properties", () => {
		expect(isGoogleOAuthUrl("https://www.google.com/")).toBe(false);
		expect(isGoogleOAuthUrl("https://mail.google.com/")).toBe(false);
		expect(isGoogleOAuthUrl("https://docs.google.com/document/d/1")).toBe(
			false,
		);
	});

	test("does not match unrelated third-party sites", () => {
		expect(isGoogleOAuthUrl("https://x.com/")).toBe(false);
		expect(isGoogleOAuthUrl("https://twitter.com/i/flow/login")).toBe(false);
		expect(
			isGoogleOAuthUrl("https://evil-accounts.google.com.attacker.io/"),
		).toBe(false);
	});

	test("handles malformed input without throwing", () => {
		expect(isGoogleOAuthUrl("")).toBe(false);
		expect(isGoogleOAuthUrl("not-a-url")).toBe(false);
		expect(isGoogleOAuthUrl("javascript:alert(1)")).toBe(false);
	});
});

describe("stripElectronFromUserAgent", () => {
	// A typical Electron default UA looks like:
	// "Mozilla/5.0 (...) AppleWebKit/537.36 (KHTML, like Gecko)
	//  Superset/1.0.0 Chrome/140.0.0.0 Electron/37.2.4 Safari/537.36"
	const ELECTRON_UA =
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Superset/1.0.0 Chrome/140.0.0.0 Electron/37.2.4 Safari/537.36";

	test("removes the Electron/* token that Google blocks on", () => {
		const result = stripElectronFromUserAgent(ELECTRON_UA);
		expect(result).not.toMatch(/Electron\//i);
	});

	test("preserves the Chrome token Google expects", () => {
		const result = stripElectronFromUserAgent(ELECTRON_UA);
		expect(result).toMatch(/Chrome\/140\.0\.0\.0/);
	});

	test("preserves the Safari and AppleWebKit tokens", () => {
		const result = stripElectronFromUserAgent(ELECTRON_UA);
		expect(result).toMatch(/AppleWebKit\/537\.36/);
		expect(result).toMatch(/Safari\/537\.36/);
	});

	test("does not leave double spaces behind after stripping", () => {
		expect(stripElectronFromUserAgent(ELECTRON_UA)).not.toMatch(/\s{2,}/);
	});

	test("returns the UA unchanged when no Electron token is present", () => {
		const chromeUa =
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
		expect(stripElectronFromUserAgent(chromeUa)).toBe(chromeUa);
	});

	test("handles uppercase Electron token", () => {
		const ua =
			"Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 ELECTRON/37.2.4 Safari/537.36";
		expect(stripElectronFromUserAgent(ua)).not.toMatch(/electron\//i);
	});
});
