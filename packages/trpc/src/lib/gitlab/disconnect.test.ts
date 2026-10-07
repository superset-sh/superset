import { expect, test } from "bun:test";
import { revokeGitlabOAuth } from "./disconnect";

const credentials = {
	clientId: "FAKE_CLIENT",
	clientSecret: "FAKE_SECRET",
	issuer: "https://git.example.invalid:8443",
};

test("OAuth revocation uses only the exact registered issuer and form credentials", async () => {
	const requests: unknown[] = [];
	await revokeGitlabOAuth(
		"git.example.invalid:8443",
		"FAKE_TOKEN",
		credentials,
		async (url, init) => {
			requests.push({
				url,
				method: init?.method,
				headers: Object.fromEntries(new Headers(init?.headers)),
				body: String(init?.body),
			});
			return Response.json({});
		},
	);
	expect(requests).toEqual([
		{
			url: "https://git.example.invalid:8443/oauth/revoke",
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: "token=FAKE_TOKEN&client_id=FAKE_CLIENT&client_secret=FAKE_SECRET",
		},
	]);
});

test("missing registration, foreign issuer and malformed token cannot send revocation credentials", async () => {
	let sends = 0;
	const send = async () => {
		sends++;
		return Response.json({});
	};
	await expect(
		revokeGitlabOAuth(
			"git.example.invalid:8443",
			"FAKE_TOKEN",
			{ ...credentials, clientId: undefined },
			send,
		),
	).rejects.toThrow("GitLab OAuth is not configured");
	await expect(
		revokeGitlabOAuth(
			"git.example.invalid:8443",
			"FAKE_TOKEN",
			{ ...credentials, clientSecret: undefined },
			send,
		),
	).rejects.toThrow("GitLab OAuth is not configured");
	for (const host of [
		"git.other.invalid:8443",
		"git.example.invalid",
		"token@git.example.invalid:8443",
		"git.example.invalid:8443/path",
	])
		await expect(
			revokeGitlabOAuth(host, "FAKE_TOKEN", credentials, send),
		).rejects.toThrow();
	for (const token of [
		"",
		"FAKE\u0000TOKEN",
		"FAKE\u007fTOKEN",
		"FAKE\r\nTOKEN",
	])
		await expect(
			revokeGitlabOAuth("git.example.invalid:8443", token, credentials, send),
		).rejects.toThrow();
	expect(sends).toBe(0);
});

test("revocation failures expose status without token payload and preserve transport failures", async () => {
	for (const status of [400, 401, 503]) {
		await expect(
			revokeGitlabOAuth(
				"git.example.invalid:8443",
				"FAKE_TOKEN",
				credentials,
				async () =>
					Response.json({ detail: "TOKEN_PAYLOAD_MUST_NOT_LEAK" }, { status }),
			),
		).rejects.toThrow(`GitLab grant revocation failed: ${status}`);
	}
	const failure = new Error("FAKE_NETWORK_FAILURE");
	await expect(
		revokeGitlabOAuth(
			"git.example.invalid:8443",
			"FAKE_TOKEN",
			credentials,
			async () => {
				throw failure;
			},
		),
	).rejects.toBe(failure);
});
