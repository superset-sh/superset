import { describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		BETTER_AUTH_SECRET: "test-secret",
		NEXT_PUBLIC_API_URL: "https://api.test",
	},
}));

const {
	beginOAuthFlow,
	clearStateCookie,
	exitOAuthFlow,
	readStateCookie,
	setStateCookie,
	STATE_COOKIES,
} = await import("./oauthFlow");
const { verifySignedState } = await import("@/lib/oauth-state");

const COOKIE = STATE_COOKIES.notion;

function setCookies(response: Response): string[] {
	return response.headers.getSetCookie();
}

describe("beginOAuthFlow", () => {
	test("binds the state it hands the provider to the asking browser", async () => {
		const response = await beginOAuthFlow({
			cookie: COOKIE,
			payload: { organizationId: "org_1", userId: "user_1" },
			authorizeUrl: (state) =>
				`https://provider.test/authorize?state=${encodeURIComponent(state)}`,
		});

		const sent = new URL(
			response.headers.get("location") ?? "",
		).searchParams.get("state");
		const cookie = setCookies(response).find((c) =>
			c.startsWith(`${COOKIE.name}=`),
		);

		expect(response.status).toBe(302);
		expect(sent).toBeTruthy();
		expect(cookie).toContain(`${COOKIE.name}=${sent}`);
		expect(verifySignedState(sent as string)).toEqual({
			organizationId: "org_1",
			userId: "user_1",
		});
	});

	test("the cookie is HttpOnly, SameSite=Lax and scoped to the flow", async () => {
		const response = await beginOAuthFlow({
			cookie: COOKIE,
			payload: { organizationId: "org_1", userId: "user_1" },
			authorizeUrl: () => "https://provider.test/authorize",
		});

		const cookie = setCookies(response)[0] ?? "";
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain(`Path=${COOKIE.path}`);
		// NEXT_PUBLIC_API_URL is https above, so the cookie must not ride http.
		expect(cookie).toContain("Secure");
	});

	test("retires a preceding leg's cookie in the same redirect", async () => {
		const response = await beginOAuthFlow({
			cookie: STATE_COOKIES.microsoftTeamsIdentity,
			payload: { organizationId: "org_1", userId: "user_1" },
			clear: [STATE_COOKIES.microsoftTeams],
			authorizeUrl: () => "https://provider.test/authorize",
		});

		const cookies = setCookies(response);
		expect(
			cookies.find((c) =>
				c.startsWith(`${STATE_COOKIES.microsoftTeamsIdentity.name}=`),
			),
		).toContain("Max-Age=600");
		expect(
			cookies.find((c) =>
				c.startsWith(`${STATE_COOKIES.microsoftTeams.name}=`),
			),
		).toContain("Max-Age=0");
	});

	test("every flow has its own cookie name", () => {
		const names = Object.values(STATE_COOKIES).map((c) => c.name);
		expect(new Set(names).size).toBe(names.length);
	});
});

describe("state cookie", () => {
	test("round-trips a state through a Cookie header", () => {
		const state = "payload.signature";
		const request = new Request("https://api.test/api/integrations/notion", {
			headers: { cookie: `other=1; ${setStateCookie(COOKIE, state)}` },
		});
		expect(readStateCookie(request, COOKIE)).toBe(state);
	});

	test("reads nothing when the browser carries no state for this flow", () => {
		const request = new Request("https://api.test/api/integrations/notion", {
			headers: { cookie: `${STATE_COOKIES.slack.name}=other.state` },
		});
		expect(readStateCookie(request, COOKIE)).toBeNull();
	});

	test("clearing expires it on the same path", () => {
		const cleared = clearStateCookie(COOKIE);
		expect(cleared).toContain(`${COOKIE.name}=;`);
		expect(cleared).toContain("Max-Age=0");
		expect(cleared).toContain(`Path=${COOKIE.path}`);
	});
});

describe("exitOAuthFlow", () => {
	test("redirects and expires the one-shot cookie", () => {
		const response = exitOAuthFlow(COOKIE, "https://web.test/integrations");
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://web.test/integrations",
		);
		expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
	});
});
