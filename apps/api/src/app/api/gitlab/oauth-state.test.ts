import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

if (process.env.SUPERSET_GITLAB_OAUTH_STATE_FIXTURE === "1") {
	mock.module("@/env", () => ({
		env: {
			BETTER_AUTH_SECRET: "test-secret",
			NEXT_PUBLIC_API_URL: "https://api.example.invalid",
		},
	}));
	mock.module("@superset/auth/env", () => ({
		env: { BETTER_AUTH_SECRET: "test-secret" },
	}));
	const crypto = await import(
		"../../../../../../packages/trpc/src/router/plugins/crypto.ts"
	);
	mock.module("@superset/trpc/integrations/plugins", () => crypto);
	let role: string | null = "admin";
	mock.module("@superset/db/utils", () => ({
		findOrgMembership: async () => (role ? { role } : null),
	}));
	const { beginGitlabOAuthFlow, resolveGitlabOAuthCallback } = await import(
		"./oauth-state"
	);
	const { createSignedState } = await import("@/lib/oauth-state");
	const opts = {
		organizationId: "org_1",
		userId: "user_1",
		origin: "https://git.example.invalid:8443",
		groupPath: "team/sub",
		clientId: "FAKE_ID",
		redirectUri: "https://api.example.invalid/api/gitlab/callback",
		issuer: "https://git.example.invalid:8443",
	};
	const redirect = (error: string) =>
		`https://web.example.invalid/integrations/gitlab?error=${error}`;
	function request(state: string, cookie: string = state): Request {
		const url = new URL(opts.redirectUri);
		url.searchParams.set("state", state);
		url.searchParams.set("code", "FAKE_CODE");
		return new Request(url, {
			headers: { cookie: `gitlab_oauth_state=${cookie}` },
		});
	}
	async function start() {
		const response = await beginGitlabOAuthFlow(opts);
		const url = new URL(response.headers.get("location") ?? "");
		return { response, url, state: url.searchParams.get("state") ?? "" };
	}
	test("the common flow binds encrypted PKCE state to its own secure cookie", async () => {
		role = "admin";
		const { response, url, state } = await start();
		expect(response.status).toBe(302);
		expect(response.headers.get("set-cookie")).toContain(
			`gitlab_oauth_state=${state}`,
		);
		expect(response.headers.get("set-cookie")).toContain(
			"HttpOnly; Secure; SameSite=Lax; Path=/api/gitlab",
		);
		const payload = JSON.parse(
			Buffer.from(state.split(".")[0] ?? "", "base64url").toString(),
		);
		expect(payload).not.toHaveProperty("verifier");
		expect(payload.pending).not.toContain("team/sub");
		const callback = await resolveGitlabOAuthCallback(request(state), redirect);
		if (callback instanceof Response) throw new Error("unexpected refusal");
		expect(callback).toMatchObject({
			organizationId: "org_1",
			userId: "user_1",
			params: { code: "FAKE_CODE" },
			pending: {
				provider: "gitlab",
				host: "git.example.invalid:8443",
				groupPath: "team/sub",
			},
		});
		expect(
			createHash("sha256")
				.update(callback.pending.verifier)
				.digest("base64url"),
		).toBe(url.searchParams.get("code_challenge"));
		expect(callback.exit(redirect("done")).headers.get("set-cookie")).toContain(
			"Max-Age=0",
		);
	});
	test("callback refuses other browser state, departed members and downgraded admins", async () => {
		role = "admin";
		const { state } = await start();
		for (const member of ["member", null]) {
			role = member;
			const result = await resolveGitlabOAuthCallback(request(state), redirect);
			expect(result).toBeInstanceOf(Response);
			if (!(result instanceof Response)) throw new Error("accepted member");
			expect(result.headers.get("location")).toContain("unauthorized");
			expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
		}
		role = "owner";
		expect(
			await resolveGitlabOAuthCallback(request(state), redirect),
		).not.toBeInstanceOf(Response);
		role = "admin";
		const result = await resolveGitlabOAuthCallback(
			request(state, "other-browser"),
			redirect,
		);
		expect(result).toBeInstanceOf(Response);
		if (!(result instanceof Response))
			throw new Error("accepted another browser");
		expect(result.headers.get("location")).toContain("invalid_state");
	});
	test("authenticated state payload still validates encrypted origin, scope and verifier", async () => {
		role = "admin";
		for (const pending of [
			"corrupt",
			await crypto.encryptSecret(
				JSON.stringify({
					provider: "linear",
					host: "git.example.invalid",
					groupPath: "team/sub",
					verifier: "x".repeat(43),
				}),
			),
			await crypto.encryptSecret(
				JSON.stringify({
					provider: "gitlab",
					host: "https://evil.invalid/path",
					groupPath: "team/sub",
					verifier: "x".repeat(43),
				}),
			),
			await crypto.encryptSecret(
				JSON.stringify({
					provider: "gitlab",
					host: "git.example.invalid",
					groupPath: "team/../other",
					verifier: "x".repeat(43),
				}),
			),
		]) {
			const state = createSignedState({
				organizationId: "org_1",
				userId: "user_1",
				pending,
			});
			const result = await resolveGitlabOAuthCallback(request(state), redirect);
			expect(result).toBeInstanceOf(Response);
			if (!(result instanceof Response))
				throw new Error("accepted invalid payload");
			expect(result.headers.get("location")).toContain("invalid_state");
			expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
		}
	});
} else {
	test("GitLab OAuth state and callback boundary", () => {
		const result = Bun.spawnSync(
			[process.execPath, "--no-env-file", "test", import.meta.path],
			{
				cwd: new URL("../../../../", import.meta.url).pathname,
				env: {
					PATH: process.env.PATH ?? "",
					TMPDIR: process.env.TMPDIR ?? "/tmp",
					SUPERSET_GITLAB_OAUTH_STATE_FIXTURE: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
				timeout: 15_000,
			},
		);
		expect(
			result.exitCode,
			result.stdout.toString() + result.stderr.toString(),
		).toBe(0);
	});
}
