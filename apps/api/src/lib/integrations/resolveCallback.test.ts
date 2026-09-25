import { describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		BETTER_AUTH_SECRET: "test-secret",
		NEXT_PUBLIC_API_URL: "https://api.test",
	},
}));

let members: Array<{ userId: string; organizationId: string }> = [];
mock.module("@superset/db/utils", () => ({
	findOrgMembership: async ({
		userId,
		organizationId,
	}: {
		userId: string;
		organizationId: string;
	}) =>
		members.find(
			(m) => m.userId === userId && m.organizationId === organizationId,
		) ?? null,
}));

const { resolveCallback } = await import("./resolveCallback");
const { setStateCookie, STATE_COOKIES } = await import("./oauthFlow");
const { createSignedState } = await import("@/lib/oauth-state");

const COOKIE = STATE_COOKIES.notion;
const ATTACKER = { organizationId: "org_attacker", userId: "user_attacker" };
const VICTIM = { organizationId: "org_victim", userId: "user_victim" };
members = [ATTACKER, VICTIM];

const CALLBACK = "https://api.test/api/integrations/notion/callback";

function callback(state: string | null, cookies: string[] = []): Request {
	const url = new URL(CALLBACK);
	url.searchParams.set("code", "authorization-code");
	if (state) url.searchParams.set("state", state);
	return new Request(url, {
		headers: cookies.length ? { cookie: cookies.join("; ") } : {},
	});
}

const options = {
	params: ["code"] as const,
	redirect: (error: string) => `https://web.test/integrations/notion?${error}`,
	cookie: COOKIE,
};

describe("resolveCallback state binding", () => {
	// GHSA-2cp5-f6gg-w5fp: the attacker mints a state for their own org, sends
	// the provider link to a victim, and the victim's grant lands in the
	// attacker's organization. The victim's browser never held the state.
	test("refuses a state the answering browser does not carry", async () => {
		const attackerState = createSignedState(ATTACKER);
		const result = await resolveCallback(
			callback(attackerState, ["better-auth.session_token=victims-session"]),
			options,
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).headers.get("location")).toContain(
			"invalid_state",
		);
	});

	test("refuses a state that is not the one this browser was given", async () => {
		const result = await resolveCallback(
			callback(createSignedState(ATTACKER), [
				setStateCookie(COOKIE, createSignedState(VICTIM)),
			]),
			options,
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).headers.get("location")).toContain(
			"invalid_state",
		);
	});

	test("refuses a state bound under another flow's cookie", async () => {
		const state = createSignedState(ATTACKER);
		const result = await resolveCallback(
			callback(state, [setStateCookie(STATE_COOKIES.slack, state)]),
			options,
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).headers.get("location")).toContain(
			"invalid_state",
		);
	});

	test("accepts the state the request's cookie carries", async () => {
		const state = createSignedState(VICTIM);
		const result = await resolveCallback(
			callback(state, [setStateCookie(COOKIE, state)]),
			options,
		);

		expect(result).not.toBeInstanceOf(Response);
		expect(result).toMatchObject({
			organizationId: VICTIM.organizationId,
			userId: VICTIM.userId,
			state,
			params: { code: "authorization-code" },
		});
	});

	test("still refuses a matching pair whose signer is not us", async () => {
		const forged = `${Buffer.from(
			JSON.stringify({ ...ATTACKER, timestamp: Date.now() }),
		).toString("base64url")}.not-our-signature`;
		const result = await resolveCallback(
			callback(forged, [setStateCookie(COOKIE, forged)]),
			options,
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).headers.get("location")).toContain(
			"invalid_state",
		);
	});

	test("still refuses a bound state whose membership is gone", async () => {
		const state = createSignedState({
			organizationId: "org_departed",
			userId: "user_departed",
		});
		const result = await resolveCallback(
			callback(state, [setStateCookie(COOKIE, state)]),
			options,
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).headers.get("location")).toContain(
			"unauthorized",
		);
	});
});

describe("resolveCallback cookie lifetime", () => {
	test("expires the state cookie on a refusal", async () => {
		const result = await resolveCallback(callback(null), options);
		expect((result as Response).headers.get("set-cookie")).toContain(
			"Max-Age=0",
		);
	});

	test("expires the state cookie on the route's own exits", async () => {
		const state = createSignedState(VICTIM);
		const result = await resolveCallback(
			callback(state, [setStateCookie(COOKIE, state)]),
			options,
		);
		if (result instanceof Response) throw new Error("expected a context");

		for (const response of [
			result.exit("https://web.test/integrations/notion"),
			result.fail("token_exchange_failed"),
		]) {
			expect(response.status).toBe(302);
			expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
		}
	});
});

describe("resolveCallback for a provider that returns no state", () => {
	const installOptions = {
		params: ["installationId"] as const,
		redirect: (error: string) =>
			`https://web.test/integrations/sentry?${error}`,
		cookie: STATE_COOKIES.sentry,
		stateInCookieOnly: true,
	};

	function install(cookies: string[]): Request {
		const url = new URL("https://api.test/api/integrations/sentry/callback");
		url.searchParams.set("installationId", "install_1");
		return new Request(url, {
			headers: cookies.length ? { cookie: cookies.join("; ") } : {},
		});
	}

	test("reads the identity from the cookie alone", async () => {
		const state = createSignedState(VICTIM);
		const result = await resolveCallback(
			install([setStateCookie(STATE_COOKIES.sentry, state)]),
			installOptions,
		);

		expect(result).toMatchObject({
			organizationId: VICTIM.organizationId,
			userId: VICTIM.userId,
		});
	});

	test("refuses a browser that carries no state for the flow", async () => {
		const result = await resolveCallback(install([]), installOptions);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).headers.get("location")).toContain(
			"invalid_state",
		);
	});
});
