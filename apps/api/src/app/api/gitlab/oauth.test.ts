import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	buildAuthorizeUrl,
	createPkcePair,
	exchangeAuthorizationCode,
} from "./oauth";

const params = {
	origin: "https://git.example.invalid:8443",
	issuer: "https://git.example.invalid:8443",
	clientId: "FAKE_ID +&",
	clientSecret: "FAKE_SECRET +&",
	redirectUri: "https://api.example.invalid/api/gitlab/callback",
	code: "FAKE_CODE +&",
	verifier: "FAKE_VERIFIER +&",
};
test("PKCE uses a fresh cryptographic verifier and SHA-256 URL-safe challenge", () => {
	const one = createPkcePair(),
		two = createPkcePair();
	expect(one.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(two.verifier).not.toBe(one.verifier);
	expect(one.challenge).toBe(
		createHash("sha256").update(one.verifier).digest("base64url"),
	);
});
test("authorize and exchange use the exact issuer and form preserve reserved characters", async () => {
	const url = new URL(
		buildAuthorizeUrl({
			...params,
			state: "FAKE_STATE +&",
			challenge: "FAKE_CHALLENGE",
		}),
	);
	expect(url.origin).toBe(params.origin);
	expect(url.pathname).toBe("/oauth/authorize");
	expect(Object.fromEntries(url.searchParams)).toEqual({
		client_id: params.clientId,
		redirect_uri: params.redirectUri,
		response_type: "code",
		state: "FAKE_STATE +&",
		scope: "api read_repository",
		code_challenge: "FAKE_CHALLENGE",
		code_challenge_method: "S256",
	});
	const before = Date.now();
	const tokens = await exchangeAuthorizationCode(params, async (url, init) => {
		expect(url).toBe(`${params.origin}/oauth/token`);
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("content-type")).toBe(
			"application/x-www-form-urlencoded",
		);
		expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual(
			{
				client_id: params.clientId,
				client_secret: params.clientSecret,
				code: params.code,
				grant_type: "authorization_code",
				redirect_uri: params.redirectUri,
				code_verifier: params.verifier,
			},
		);
		return Response.json({
			access_token: "FAKE_ACCESS",
			refresh_token: "FAKE_REFRESH",
			expires_in: 60,
		});
	});
	expect(tokens).toMatchObject({
		accessToken: "FAKE_ACCESS",
		refreshToken: "FAKE_REFRESH",
	});
	expect(tokens.tokenExpiresAt.getTime()).toBeGreaterThanOrEqual(
		before + 60000,
	);
	expect(tokens.tokenExpiresAt.getTime()).toBeLessThanOrEqual(
		Date.now() + 60000,
	);
});
test("wrong origin or missing client settings send no code, verifier or client secret", async () => {
	let calls = 0;
	const send = async () => {
		calls++;
		return Response.json({});
	};
	for (const invalid of [
		{ ...params, origin: "https://other.invalid" },
		{ ...params, origin: "http://git.example.invalid:8443" },
		{ ...params, clientId: "" },
		{ ...params, clientSecret: "" },
	])
		await expect(exchangeAuthorizationCode(invalid, send)).rejects.toThrow();
	expect(() =>
		buildAuthorizeUrl({
			...params,
			origin: "https://other.invalid",
			state: "state",
			challenge: "challenge",
		}),
	).toThrow();
	expect(calls).toBe(0);
});
test("provider payloads are redacted and unusable returned grant pairs are rejected", async () => {
	for (const payload of [
		{},
		{ access_token: "FAKE_ACCESS" },
		{
			access_token: "fake token",
			refresh_token: "FAKE_REFRESH",
			expires_in: 60,
		},
		{
			access_token: "FAKE_ACCESS",
			refresh_token: "fake\u0000",
			expires_in: 60,
		},
		{
			access_token: "FAKE_ACCESS",
			refresh_token: "FAKE_REFRESH",
			expires_in: 0,
		},
		{
			access_token: "FAKE_ACCESS",
			refresh_token: "FAKE_REFRESH",
			expires_in: 1e30,
		},
	])
		await expect(
			exchangeAuthorizationCode(params, async () => Response.json(payload)),
		).rejects.toMatchObject({ status: 502 });
	const error = await exchangeAuthorizationCode(
		params,
		async () => new Response("FAKE_PRIVATE_PAYLOAD", { status: 401 }),
	).catch((error) => error);
	expect(error).toMatchObject({ status: 401 });
	expect(error.message).not.toContain("FAKE_PRIVATE");
	const offline = new Error("offline");
	await expect(
		exchangeAuthorizationCode(params, async () => {
			throw offline;
		}),
	).rejects.toBe(offline);
});
