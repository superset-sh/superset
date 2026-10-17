import { afterEach, describe, expect, mock, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { login, refreshAccessToken, resolveAuthorizeUrl } from "./auth";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

/**
 * Let the promise chain's microtasks run so a synchronous settlement (the
 * login flow does no I/O before it settles in these cases) becomes observable.
 * A bounded number of ticks keeps a login that never settles from hanging the
 * test, and avoids any wall-clock wait.
 */
async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 4; i++) await Promise.resolve();
}

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

	test("honours a cancellation raised while the loopback port is being bound", async () => {
		const printed: string[] = [];
		const opened: string[] = [];

		const controller = new AbortController();
		const loginPromise = login(controller.signal, {
			// The port binds, but the signal lands while it does: nothing may be
			// published or opened for a login that is already cancelled.
			bindLoopbackServer: async () => {
				controller.abort();
				return { server: { close: () => {} } as never, port: 51789 };
			},
			shouldOpenBrowser: () => true,
			openBrowser: async (url) => {
				opened.push(url);
			},
			onAuthorizationUrl: (url) => {
				printed.push(url);
			},
			promptForPastedCode: () => new Promise<string>(() => {}),
		});

		await expect(loginPromise).rejects.toThrow("Login cancelled");
		expect(printed).toHaveLength(0);
		expect(opened).toHaveLength(0);
	});

	test("honours a cancellation raised while the authorization URL is handled", async () => {
		const printed: string[] = [];
		let pastePrompted = false;

		const controller = new AbortController();
		let notifyAuthUrl!: () => void;
		const authUrlEmitted = new Promise<void>((resolve) => {
			notifyAuthUrl = resolve;
		});
		const loginPromise = login(controller.signal, {
			bindLoopbackServer: async () => null,
			shouldOpenBrowser: () => true,
			openBrowser: async () => {},
			onAuthorizationUrl: (url) => {
				printed.push(url);
				// A cancellation raised from here lands after the pre-publish
				// check and before the abort listener, so login has to re-check
				// the signal instead of starting a wait nothing can end.
				controller.abort();
				notifyAuthUrl();
			},
			promptForPastedCode: () => {
				pastePrompted = true;
				return new Promise<string>(() => {});
			},
		});

		await authUrlEmitted;
		expect(printed).toHaveLength(1);

		let cancelled: unknown = null;
		void loginPromise.catch((error) => {
			cancelled = error;
		});
		await flushMicrotasks();

		// A cancelled login must not fall through into the paste wait.
		expect(pastePrompted).toBe(false);
		expect(cancelled).toBeInstanceOf(CLIError);
		expect((cancelled as CLIError).message).toBe("Login cancelled");
	});

	test("keeps the login alive when the browser launcher rejects", async () => {
		const printed: string[] = [];

		const controller = new AbortController();
		let notifyAuthUrl!: () => void;
		const authUrlEmitted = new Promise<void>((resolve) => {
			notifyAuthUrl = resolve;
		});
		const loginPromise = login(controller.signal, {
			// `waitForCallback` attaches a "request" listener, so the stub must
			// expose `on`: without it the login rejects on a missing method and
			// the test never reaches the callback wait it means to exercise.
			bindLoopbackServer: async () => ({
				server: { on: () => {}, close: () => {} } as never,
				port: 51789,
			}),
			shouldOpenBrowser: () => true,
			openBrowser: async () => {
				throw new Error("no launcher");
			},
			onAuthorizationUrl: (url) => {
				printed.push(url);
				notifyAuthUrl();
			},
			promptForPastedCode: () => new Promise<string>(() => {}),
		});

		// The URL is still presented and the flow keeps waiting for the
		// callback: a launcher that cannot start must not abort the login.
		await authUrlEmitted;
		expect(printed).toHaveLength(1);

		let settled = false;
		void loginPromise.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		// The launcher rejection must not settle the login: it stays pending
		// until the callback arrives or the caller cancels.
		await flushMicrotasks();
		expect(settled).toBe(false);

		controller.abort();
		await expect(loginPromise).rejects.toThrow("Login cancelled");
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
