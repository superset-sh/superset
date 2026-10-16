import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { jwt } from "better-auth/plugins";

// Guards the bun patch on @better-auth/oauth-provider (patches/README.md).
// patchedDependencies is keyed to an exact version, so a bump silently drops
// the patch, and parallel CLI refreshes log the user out on every machine
// again (GH #8426). If this fails after a bump, re-create the patch per
// patches/README.md; do NOT delete the test.
const repoRoot = join(import.meta.dir, "../../..");
const API_URL = "http://localhost:3999";
const CLIENT_ID = "superset-cli";

type Row = Record<string, unknown>;

async function setup() {
	const db: Record<string, Row[]> = {};
	const auth = betterAuth({
		baseURL: API_URL,
		secret: "oauth-provider-patch-test-secret-0123456789",
		database: memoryAdapter(db),
		logger: { disabled: true },
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: `${API_URL}/sign-in`,
				consentPage: `${API_URL}/consent`,
				validAudiences: [API_URL],
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
		],
	});
	const ctx = await auth.$context;
	for (const model of Object.keys(ctx.tables)) db[model] ??= [];
	const user = await ctx.internalAdapter.createUser({
		email: "patch@test.local",
		name: "Patch",
		emailVerified: true,
	});
	await ctx.adapter.create({
		model: "oauthClient",
		data: {
			clientId: CLIENT_ID,
			public: true,
			scopes: ["openid", "offline_access"],
			grantTypes: ["authorization_code", "refresh_token"],
			tokenEndpointAuthMethod: "none",
			redirectUris: ["http://127.0.0.1/callback"],
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	const seedRefreshToken = async (token: string) =>
		ctx.adapter.create({
			model: "oauthRefreshToken",
			data: {
				token: createHash("sha256").update(token).digest("base64url"),
				clientId: CLIENT_ID,
				userId: user.id,
				scopes: ["openid", "offline_access"],
				createdAt: new Date(),
				expiresAt: new Date(Date.now() + 86_400_000),
			},
		});
	const refresh = (token: string) =>
		auth.handler(
			new Request(`${API_URL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: token,
					client_id: CLIENT_ID,
					resource: API_URL,
				}),
			}),
		);
	const liveTokens = () =>
		(db.oauthRefreshToken ?? []).filter((row) => !row.revoked).length;
	const backdateRevocations = (ms: number) => {
		for (const row of db.oauthRefreshToken ?? []) {
			if (row.revoked) row.revoked = new Date(Date.now() - ms);
		}
	};
	return { seedRefreshToken, refresh, liveTokens, backdateRevocations };
}

describe("@better-auth/oauth-provider refresh reuse grace patch", () => {
	test("is registered for the installed version", () => {
		const installed = JSON.parse(
			readFileSync(
				join(
					import.meta.dir,
					"../node_modules/@better-auth/oauth-provider/package.json",
				),
				"utf8",
			),
		).version;
		const patched = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		).patchedDependencies;
		expect(patched[`@better-auth/oauth-provider@${installed}`]).toBeString();
	});

	test("a just-rotated token sent again is rejected without revoking the user's other tokens", async () => {
		const t = await setup();
		await t.seedRefreshToken("machine-a");
		await t.seedRefreshToken("machine-b");

		expect((await t.refresh("machine-a")).status).toBe(200);
		const reuse = await t.refresh("machine-a");

		expect(reuse.status).toBe(400);
		expect((await reuse.json()).error).toBe("invalid_grant");
		expect(t.liveTokens()).toBe(2);
		expect((await t.refresh("machine-b")).status).toBe(200);
	});

	test("reuse after the grace window still revokes every token of the user", async () => {
		const t = await setup();
		await t.seedRefreshToken("machine-a");
		await t.seedRefreshToken("machine-b");

		expect((await t.refresh("machine-a")).status).toBe(200);
		t.backdateRevocations(10 * 60 * 1000 + 1);

		expect((await t.refresh("machine-a")).status).toBe(400);
		expect(t.liveTokens()).toBe(0);
		expect((await t.refresh("machine-b")).status).toBe(400);
	});
});
