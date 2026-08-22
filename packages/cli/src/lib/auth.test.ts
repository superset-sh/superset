import { afterEach, describe, expect, mock, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { login, refreshAccessToken, resolveAuthorizeUrl } from "./auth";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("login /authorize (single request)", () => {
	test("opens and prints the SAME url (one /authorize) when loopback is used", async () => {
		const opened: string[] = [];
		const printed: string[] = [];

		const controller = new AbortController();
		let notifyAuthUrl!: () => void;
		const authUrlEmitted = new Promise<void>((resolve) => {
			notifyAuthUrl = resolve;
		});
		const loginPromise = login(controller.signal, {
			// A loopback port is "bound" — but we never let the fake server
			// actually receive a code; the test only asserts on the URL(s).
			bindLoopbackServer: async () => ({
				server: { close: () => {} } as never,
				port: 51789,
			}),
			shouldOpenBrowser: () => true,
			openBrowser: async (url) => {
				opened.push(url);
			},
			onAuthorizationUrl: (url) => {
				printed.push(url);
				notifyAuthUrl();
			},
			// Not reached in the loopback path, but keep it a never-resolving
			// stub so the login promise stays pending if it is mis-reached.
			promptForPastedCode: () => new Promise<string>(() => {}),
		});

		await authUrlEmitted;

		expect(printed).toHaveLength(1);
		expect(opened).toEqual(printed);
		// Exactly one authorize request, redirecting to the loopback callback.
		const url = new URL(printed[0]!);
		expect(url.pathname).toBe("/api/auth/oauth2/authorize");
		expect(url.searchParams.get("redirect_uri")).toBe(
			"http://127.0.0.1:51789/callback",
		);

		controller.abort();
		await loginPromise.catch(() => {});
	});

	test("prints the paste URL and opens nothing when loopback is unavailable", async () => {
		const opened: string[] = [];
		const printed: string[] = [];

		const controller = new AbortController();
		let notifyAuthUrl!: () => void;
		const authUrlEmitted = new Promise<void>((resolve) => {
			notifyAuthUrl = resolve;
		});
		const loginPromise = login(controller.signal, {
			bindLoopbackServer: async () => null, // no port bound
			shouldOpenBrowser: () => true,
			openBrowser: async (url) => {
				opened.push(url);
			},
			onAuthorizationUrl: (url) => {
				printed.push(url);
				notifyAuthUrl();
			},
			promptForPastedCode: () => new Promise<string>(() => {}),
		});

		await authUrlEmitted;

		expect(printed).toHaveLength(1);
		expect(opened).toHaveLength(0);
		const url = new URL(printed[0]!);
		expect(url.searchParams.get("redirect_uri")).toBe(
			"https://app.superset.sh/cli/auth/code",
		);

		controller.abort();
		await loginPromise.catch(() => {});
	});
});

describe("resolveAuthorizeUrl", () => {
	const base = {
		apiUrl: "https://api.superset.test",
		webUrl: "https://app.superset.test",
		codeChallenge: "challenge",
		state: "state-123",
	};

	test("uses loopback when a port bound and the browser opens", () => {
		const { authorizeUrl, useLoopback, redirectUri } = resolveAuthorizeUrl({
			...base,
			loopbackRedirectUri: "http://127.0.0.1:51789/callback",
			shouldOpenBrowser: true,
		});
		expect(useLoopback).toBe(true);
		expect(redirectUri).toBe("http://127.0.0.1:51789/callback");
		expect(new URL(authorizeUrl).searchParams.get("redirect_uri")).toBe(
			"http://127.0.0.1:51789/callback",
		);
	});

	test("falls back to the paste URL when the browser is not opened", () => {
		const { authorizeUrl, useLoopback, redirectUri } = resolveAuthorizeUrl({
			...base,
			loopbackRedirectUri: "http://127.0.0.1:51789/callback",
			shouldOpenBrowser: false, // SSH / non-TTY / CI
		});
		expect(useLoopback).toBe(false);
		expect(redirectUri).toBe("https://app.superset.test/cli/auth/code");
		expect(new URL(authorizeUrl).searchParams.get("redirect_uri")).toBe(
			"https://app.superset.test/cli/auth/code",
		);
	});

	test("falls back to the paste URL when no loopback port bound", () => {
		const { useLoopback, redirectUri } = resolveAuthorizeUrl({
			...base,
			loopbackRedirectUri: null,
			shouldOpenBrowser: true,
		});
		expect(useLoopback).toBe(false);
		expect(redirectUri).toBe("https://app.superset.test/cli/auth/code");
	});

	test("a single /authorize URL is always produced (#6310)", () => {
		const { authorizeUrl } = resolveAuthorizeUrl({
			...base,
			loopbackRedirectUri: "http://127.0.0.1:51789/callback",
			shouldOpenBrowser: true,
		});
		const url = new URL(authorizeUrl);
		expect(url.pathname).toBe("/api/auth/oauth2/authorize");
		expect(url.searchParams.get("client_id")).toBe("superset-cli");
		expect(url.searchParams.get("state")).toBe("state-123");
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
