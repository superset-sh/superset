import { afterEach, describe, expect, mock, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { isSafeBrowserUrl, refreshAccessToken } from "./auth";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("isSafeBrowserUrl", () => {
	test("accepts a typical OAuth authorize URL with query params and ampersands", () => {
		const url =
			"https://api.superset.sh/api/auth/oauth2/authorize?client_id=cli&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A51789%2Fcallback&scope=openid%20profile&state=abc";
		expect(isSafeBrowserUrl(url)).toBe(true);
	});

	test("accepts http://localhost", () => {
		expect(isSafeBrowserUrl("http://127.0.0.1:3000/x")).toBe(true);
	});

	test("rejects non-http(s) schemes", () => {
		expect(isSafeBrowserUrl("javascript:alert(1)")).toBe(false);
		expect(isSafeBrowserUrl("file:///etc/passwd")).toBe(false);
		expect(isSafeBrowserUrl("ssh://user@host")).toBe(false);
	});

	test("rejects garbage that doesn't parse", () => {
		expect(isSafeBrowserUrl("not a url")).toBe(false);
		expect(isSafeBrowserUrl("")).toBe(false);
	});

	test("rejects shell metacharacters that could escape quoting", () => {
		// These are the chars that could break out of cmd.exe's `"..."`
		// quoting if a URL ever contained them. Real URLs don't.
		expect(isSafeBrowserUrl('https://x.com/"evil')).toBe(false);
		expect(isSafeBrowserUrl("https://x.com/`evil")).toBe(false);
		expect(isSafeBrowserUrl("https://x.com/\\evil")).toBe(false);
		expect(isSafeBrowserUrl("https://x.com/<evil")).toBe(false);
		expect(isSafeBrowserUrl("https://x.com/^evil")).toBe(false);
		expect(isSafeBrowserUrl("https://x.com/|evil")).toBe(false);
	});

	test("accepts percent-encoded URLs (cmd %-expansion is handled at launch)", () => {
		expect(
			isSafeBrowserUrl("https://x.com/?redirect=http%3A%2F%2Fexample.com"),
		).toBe(true);
	});

	test("rejects whitespace and control chars", () => {
		expect(isSafeBrowserUrl("https://x.com/a b")).toBe(false);
		expect(isSafeBrowserUrl("https://x.com/a\nb")).toBe(false);
		expect(isSafeBrowserUrl("https://x.com/a\x00b")).toBe(false);
	});
});

describe("refreshAccessToken", () => {
	test("sanitizes OAuth refresh failure details", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						error: "invalid_grant",
						access_token: "access-secret",
						refresh_token: "refresh-secret",
						redirect: "https://app.superset.test/callback?code=code-secret",
						cookie: "session=session-secret",
					}),
					{ status: 400 },
				),
		) as unknown as typeof fetch;

		let thrown: unknown;
		try {
			await refreshAccessToken("refresh-secret");
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(CLIError);
		const error = thrown as CLIError;
		const visibleText = `${error.message} ${error.suggestion ?? ""}`;
		expect(visibleText).toContain("Token refresh failed: 400");
		expect(visibleText).toContain("superset auth login");
		expect(visibleText).not.toContain("access-secret");
		expect(visibleText).not.toContain("refresh-secret");
		expect(visibleText).not.toContain("session-secret");
		expect(visibleText).not.toContain("code-secret");
	});
});
