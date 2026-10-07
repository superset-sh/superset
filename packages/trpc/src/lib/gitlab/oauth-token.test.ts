import { expect, test } from "bun:test";
import { exchangeGitlabToken } from "./oauth-token";

const state = {
	provider: "gitlab",
	host: "git.example.invalid:8443",
	groupPath: "acme/sub",
	auth: "oauth",
	webhookSecret: "FAKE_SECRET",
};
const connection = { state, refreshToken: "FAKE_REFRESH" };
const credentials = {
	clientId: "FAKE_ID",
	clientSecret: "FAKE_CLIENT_SECRET",
	issuer: "https://git.example.invalid:8443",
};
test("OAuth rotation targets the exact registered issuer and retains the returned pair", async () => {
	const before = Date.now();
	const result = await exchangeGitlabToken(
		connection,
		credentials,
		async (url, init) => {
			expect(String(url)).toBe("https://git.example.invalid:8443/oauth/token");
			expect(init?.method).toBe("POST");
			expect(new Headers(init?.headers).get("Content-Type")).toBe(
				"application/x-www-form-urlencoded",
			);
			expect(
				Object.fromEntries(new URLSearchParams(String(init?.body))),
			).toEqual({
				grant_type: "refresh_token",
				refresh_token: "FAKE_REFRESH",
				client_id: "FAKE_ID",
				client_secret: "FAKE_CLIENT_SECRET",
			});
			return Response.json({
				access_token: "FAKE_NEW_ACCESS",
				refresh_token: "FAKE_NEW_REFRESH",
				expires_in: 60,
			});
		},
	);
	expect(result).toMatchObject({
		accessToken: "FAKE_NEW_ACCESS",
		refreshToken: "FAKE_NEW_REFRESH",
	});
	if (!("tokenExpiresAt" in result)) throw new Error("No rotated pair");
	expect(result.tokenExpiresAt.getTime()).toBeGreaterThanOrEqual(
		before + 60000,
	);
	expect(result.tokenExpiresAt.getTime()).toBeLessThanOrEqual(
		Date.now() + 60000,
	);
});
test("issuer mismatch and unusable refresh state send no credentials", async () => {
	let calls = 0;
	const send = async () => {
		calls++;
		return Response.json({});
	};
	await expect(
		exchangeGitlabToken(
			connection,
			{ ...credentials, issuer: "https://other.invalid" },
			send,
		),
	).rejects.toThrow("registration");
	for (const bad of [
		{ ...connection, refreshToken: null },
		{ ...connection, state: { ...state, auth: "token" } },
		{ ...connection, state: null },
	])
		expect(await exchangeGitlabToken(bad, credentials, send)).toEqual({
			revoked: "needs_reauth",
		});
	expect(
		await exchangeGitlabToken(
			connection,
			{ ...credentials, clientId: undefined },
			send,
		),
	).toEqual({ revoked: "needs_reauth" });
	expect(calls).toBe(0);
});
test("only known grant revocation disconnects; server faults and invalid success remain failures", async () => {
	for (const error of ["invalid_grant", "invalid_client"])
		expect(
			await exchangeGitlabToken(connection, credentials, async () =>
				Response.json({ error }, { status: 400 }),
			),
		).toEqual({ revoked: "needs_reauth" });
	await expect(
		exchangeGitlabToken(connection, credentials, async () =>
			Response.json({ error: "invalid_grant" }, { status: 503 }),
		),
	).rejects.toMatchObject({ status: 503 });
	for (const payload of [
		{ access_token: "FAKE_ACCESS", expires_in: 60 },
		{ access_token: " ", refresh_token: "FAKE_REFRESH", expires_in: 60 },
		{
			access_token: "FAKE_ACCESS",
			refresh_token: "FAKE_REFRESH",
			expires_in: 1e30,
		},
		{
			access_token: "FAKE_ACCESS",
			refresh_token: "FAKE_REFRESH",
			expires_in: 0,
		},
	])
		await expect(
			exchangeGitlabToken(connection, credentials, async () =>
				Response.json(payload),
			),
		).rejects.toMatchObject({ status: 502 });
	await expect(
		exchangeGitlabToken(connection, credentials, async () =>
			Response.json(
				{ error: "unknown", secret: "FAKE_PRIVATE" },
				{ status: 400 },
			),
		),
	).rejects.toMatchObject({ status: 400 });
	await expect(
		exchangeGitlabToken(connection, credentials, async () => {
			throw new Error("offline");
		}),
	).rejects.toThrow("offline");
});

test("malformed opaque tokens fail before a rotated pair can replace stored credentials", async () => {
	for (const token of ["fake\u0000token", "fake\u007ftoken", "fake😀token"]) {
		for (const field of ["access_token", "refresh_token"]) {
			await expect(
				exchangeGitlabToken(connection, credentials, async () =>
					Response.json({
						access_token: "FAKE_ACCESS",
						refresh_token: "FAKE_REFRESH",
						expires_in: 60,
						[field]: token,
					}),
				),
			).rejects.toMatchObject({ status: 502 });
		}
	}
});
