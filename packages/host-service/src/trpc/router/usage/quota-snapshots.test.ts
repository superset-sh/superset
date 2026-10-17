import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	captureClaudeCredentialSlots,
	captureClaudeQuotaSnapshot,
	readDefaultQuotaCredential,
	readProfileCredential,
} from "./claude";
import { captureCodexQuotaSnapshot } from "./codex";
import type { ClaudeProfile, CodexHome } from "./profiles";
import { createQuotaCache } from "./quota-cache";
import type { UsageAccount } from "./types";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});
async function directory() {
	const dir = await mkdtemp(join(tmpdir(), "superset-quota-snapshot-"));
	directories.push(dir);
	return dir;
}
function claudeProfile(home: string): ClaudeProfile {
	return {
		configDir: home,
		sourceLabel: "synthetic",
		email: "a@example.test",
		credentialKind: "subscription",
		loginFingerprint: null,
		credentialsPath: join(home, ".credentials.json"),
		keychainServices: [],
	};
}
const quota: UsageAccount = {
	agent: "claude",
	credentialKind: "subscription",
	accountKey: "synthetic",
	sourceLabel: "synthetic",
	email: "a@example.test",
	plan: "test",
	status: "ok",
	statusDetail: null,
	windows: [],
	creditsBalance: null,
	extraUsage: null,
	selection: null,
	isDefault: false,
	fetchedAt: new Date(0),
};

test("Claude snapshot fetch uses its captured token after mutable input changes", async () => {
	const credentials = [
		{
			accessToken: "synthetic-a",
			expiresAt: null,
			refreshTokenExpiresAt: null,
			subscriptionType: null,
			accountKey: "slot",
			sourceLabel: "test",
			selection: null,
		},
	];
	const loaded: string[] = [];
	const snapshot = await captureClaudeQuotaSnapshot(
		async () => ({ credentials, signedOutProfiles: [], apiProfiles: [] }),
		async (credential) => {
			loaded.push(credential.accessToken);
			return quota;
		},
	);
	const original = credentials[0];
	if (!original) throw new Error("Synthetic credential missing");
	original.accessToken = "synthetic-b";
	const next = await captureClaudeQuotaSnapshot(
		async () => ({ credentials, signedOutProfiles: [], apiProfiles: [] }),
		async () => quota,
	);
	expect(snapshot.revision).not.toBe(next.revision);
	await snapshot.load();
	expect(loaded).toEqual(["synthetic-a"]);
	expect(JSON.stringify(snapshot)).not.toContain("synthetic-a");
});

test("Claude strict profile reads reject malformed credentials instead of treating them as signed out", async () => {
	const home = await directory();
	const profile = claudeProfile(home);
	expect(await readProfileCredential(profile, true)).toBeNull();
	for (const raw of [
		"not-json",
		'{"claudeAiOauth":{"accessToken":42}}',
		'{"claudeAiOauth":null}',
	]) {
		await writeFile(profile.credentialsPath, raw);
		await expect(readProfileCredential(profile, true)).rejects.toThrow(
			"could not be verified",
		);
	}
});

test("Codex captures token and account header instead of reopening a rotated auth file", async () => {
	const home = await directory();
	const homes: CodexHome[] = [
		{
			home,
			sourceLabel: "test",
			credentialKind: "subscription",
			loginFingerprint: null,
		},
	];
	const auth = (token: string, account: string) =>
		JSON.stringify({
			auth_mode: "chatgpt",
			tokens: { access_token: token, account_id: account },
		});
	await writeFile(join(home, "auth.json"), auth("synthetic-a", "account-a"));
	const loaded: unknown[] = [];
	const fetchQuota = async (token: string, account?: string) => {
		loaded.push([token, account]);
		return {
			email: "a@example.test",
			plan: "test",
			status: "ok" as const,
			statusDetail: null,
			windows: [],
			creditsBalance: null,
		};
	};
	const first = await captureCodexQuotaSnapshot(async () => homes, fetchQuota);
	await writeFile(join(home, "auth.json"), auth("synthetic-b", "account-b"));
	const second = await captureCodexQuotaSnapshot(async () => homes, fetchQuota);
	expect(first.revision).not.toBe(second.revision);
	await first.load();
	expect(loaded).toEqual([["synthetic-a", "account-a"]]);
	expect(JSON.stringify(first)).not.toContain("synthetic-a");
});

test("Codex missing credentials are distinct from malformed and unsupported storage", async () => {
	const home = await directory();
	const homes: CodexHome[] = [
		{
			home,
			sourceLabel: "test",
			credentialKind: "subscription",
			loginFingerprint: null,
		},
	];
	const absent = await captureCodexQuotaSnapshot(async () => homes);
	expect(await absent.load()).toEqual([]);
	await writeFile(join(home, "auth.json"), "invalid-json");
	expect(
		(await (await captureCodexQuotaSnapshot(async () => homes)).load())[0],
	).toMatchObject({
		status: "unavailable",
		email: null,
		plan: null,
		windows: [],
	});
	await writeFile(
		join(home, "auth.json"),
		JSON.stringify({ tokens: { access_token: "synthetic" } }),
	);
	for (const config of [
		'cli_auth_credentials_store = "keyring"',
		'cli_auth_credentials_store = "auto"',
		'cli_auth_credentials_store = "ephemeral"',
		"bad = [",
	]) {
		await writeFile(join(home, "config.toml"), config);
		expect(
			(await (await captureCodexQuotaSnapshot(async () => homes)).load())[0],
		).toMatchObject({
			status: "unavailable",
			email: null,
			plan: null,
			windows: [],
		});
	}
});

test("Claude unreadable A stays anonymous while healthy B loads and A can recover", async () => {
	const homeA = await directory();
	const homeB = await directory();
	const profileA = claudeProfile(homeA);
	const profileB = { ...claudeProfile(homeB), email: "b@example.test" };
	await writeFile(
		profileA.credentialsPath,
		'{"claudeAiOauth":{"accessToken":"synthetic-a"}}',
	);
	await writeFile(
		profileB.credentialsPath,
		'{"claudeAiOauth":{"accessToken":"synthetic-b"}}',
	);
	const capture = () =>
		captureClaudeCredentialSlots(
			[profileA, profileB].map((profile) => ({
				profile,
				source: {
					agent: "claude" as const,
					accountKey: profile.configDir,
					sourceLabel: profile.sourceLabel,
					selection: profile.configDir,
				},
				read: () => readProfileCredential(profile, true),
			})),
			[],
		);
	const loaded: string[] = [];
	const cache = createQuotaCache(
		() =>
			captureClaudeQuotaSnapshot(capture, async (credential) => {
				loaded.push(credential.accessToken);
				return {
					...quota,
					accountKey: credential.accountKey,
					email: credential.email ?? null,
				};
			}),
		300_000,
	);
	expect((await cache.get()).map((account) => account.email)).toEqual([
		"a@example.test",
		"b@example.test",
	]);
	await writeFile(profileA.credentialsPath, "malformed");
	const unreadable = await cache.get();
	expect(
		unreadable.find((account) => account.accountKey === homeA),
	).toMatchObject({
		status: "unavailable",
		email: null,
		plan: null,
		windows: [],
	});
	expect(
		unreadable.find((account) => account.email === "b@example.test")?.status,
	).toBe("ok");
	expect(loaded).toEqual(["synthetic-a", "synthetic-b", "synthetic-b"]);
	await writeFile(
		profileA.credentialsPath,
		'{"claudeAiOauth":{"accessToken":"synthetic-a-new"}}',
	);
	expect((await cache.get()).map((account) => account.status)).toEqual([
		"ok",
		"ok",
	]);
	expect(loaded).toContain("synthetic-a-new");
});

test("Codex unreadable A does not block healthy B and changed credentials recover within cache TTL", async () => {
	const homeA = await directory();
	const homeB = await directory();
	const homes: CodexHome[] = [homeA, homeB].map((home) => ({
		home,
		sourceLabel: "test",
		credentialKind: "subscription",
		loginFingerprint: null,
	}));
	await writeFile(join(homeA, "auth.json"), "malformed");
	await writeFile(
		join(homeB, "auth.json"),
		'{"tokens":{"access_token":"synthetic-b"}}',
	);
	const loaded: string[] = [];
	const cache = createQuotaCache(
		() =>
			captureCodexQuotaSnapshot(
				async () => homes,
				async (token) => {
					loaded.push(token);
					return {
						email: `${token}@example.test`,
						plan: "test",
						status: "ok",
						statusDetail: null,
						windows: [],
						creditsBalance: null,
					};
				},
			),
		300_000,
	);
	const accounts = await cache.get();
	expect(accounts.map((account) => account.status)).toEqual([
		"unavailable",
		"ok",
	]);
	expect(accounts[0]).toMatchObject({ email: null, plan: null, windows: [] });
	expect(loaded).toEqual(["synthetic-b"]);
	await writeFile(
		join(homeA, "auth.json"),
		'{"tokens":{"access_token":"synthetic-a"}}',
	);
	expect((await cache.get()).map((account) => account.status)).toEqual([
		"ok",
		"ok",
	]);
	expect(loaded).toContain("synthetic-a");
});

test("unreadable provider discovery yields only anonymous unavailable state and keeps the other provider loadable", async () => {
	const failed = async (): Promise<never> => {
		throw new Error("must-not-be-shown");
	};
	for (const snapshot of [
		await captureClaudeQuotaSnapshot(failed),
		await captureCodexQuotaSnapshot(failed),
	]) {
		const accounts = await snapshot.load();
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			status: "unavailable",
			email: null,
			plan: null,
			windows: [],
		});
		expect(JSON.stringify(accounts)).not.toContain("must-not-be-shown");
	}
	const claude = await captureClaudeQuotaSnapshot(failed);
	const codex = await captureCodexQuotaSnapshot(async () => [
		{
			home: "/synthetic/api",
			sourceLabel: "test",
			credentialKind: "api_key",
			loginFingerprint: null,
		},
	]);
	expect(
		(await Promise.all([claude.load(), codex.load()]))
			.flat()
			.map((account) => account.status),
	).toEqual(["unavailable", "ok"]);
});

test("API-billed Codex snapshots do not open auth files or fetch quota", async () => {
	const home = await directory();
	await writeFile(join(home, "auth.json"), "must-not-be-read");
	const snapshot = await captureCodexQuotaSnapshot(
		async () => [
			{
				home,
				sourceLabel: "test",
				credentialKind: "api_key",
				loginFingerprint: "marker",
			},
		],
		async () => {
			throw new Error("must not fetch");
		},
	);
	expect((await snapshot.load())[0]?.credentialKind).toBe("api_key");
});

test("API-billed Claude profiles skip a matching explicit credential reader", async () => {
	const profile = {
		...claudeProfile("/synthetic/api"),
		credentialKind: "api_key" as const,
	};
	let reads = 0;
	const input = await captureClaudeCredentialSlots(
		[
			{
				source: {
					agent: "claude",
					accountKey: profile.configDir,
					sourceLabel: profile.sourceLabel,
					selection: profile.configDir,
				},
				read: async () => {
					reads++;
					throw new Error("must not read API credential");
				},
			},
		],
		[profile],
	);
	const snapshot = await captureClaudeQuotaSnapshot(async () => input);
	expect(reads).toBe(0);
	expect(
		(await snapshot.load()).map((account) => account.credentialKind),
	).toEqual(["api_key"]);
});

test("optional Claude display metadata cannot hide a readable credential", async () => {
	const credential = {
		accessToken: "synthetic-default",
		expiresAt: null,
		refreshTokenExpiresAt: null,
		subscriptionType: null,
		accountKey: "default",
		sourceLabel: "test",
		selection: null,
	};
	const result = await readDefaultQuotaCredential(
		async () => [credential],
		async () => {
			throw new Error("metadata changed");
		},
	);
	expect(result).toEqual({ ...credential, email: null });
});

test("Claude display-only email changes do not invalidate captured credentials", async () => {
	const credential = {
		accessToken: "synthetic-default",
		expiresAt: null,
		refreshTokenExpiresAt: null,
		subscriptionType: null,
		accountKey: "default",
		sourceLabel: "test",
		selection: null,
	};
	const first = await captureClaudeQuotaSnapshot(
		async () => ({
			credentials: [{ ...credential, email: "a@example.test" }],
			signedOutProfiles: [],
			apiProfiles: [],
		}),
		async () => quota,
	);
	const next = await captureClaudeQuotaSnapshot(
		async () => ({
			credentials: [{ ...credential, email: null }],
			signedOutProfiles: [],
			apiProfiles: [],
		}),
		async () => quota,
	);
	expect(first.revision).toBe(next.revision);
});

test("default Claude credential failures remain strict despite optional metadata", async () => {
	await expect(
		readDefaultQuotaCredential(
			async () => {
				throw new Error("credential unreadable");
			},
			async () => "a@example.test",
		),
	).rejects.toThrow("credential unreadable");
});

test("Codex null account ID is absent while non-string IDs remain unavailable", async () => {
	const home = await directory();
	const homes: CodexHome[] = [
		{
			home,
			sourceLabel: "test",
			credentialKind: "subscription",
			loginFingerprint: null,
		},
	];
	const headers: Array<string | undefined> = [];
	const fetchQuota = async (_token: string, account?: string) => {
		headers.push(account);
		return {
			email: "a@example.test",
			plan: "test",
			status: "ok" as const,
			statusDetail: null,
			windows: [],
			creditsBalance: null,
		};
	};
	await writeFile(
		join(home, "auth.json"),
		JSON.stringify({ tokens: { access_token: "synthetic", account_id: null } }),
	);
	expect(
		(
			await (
				await captureCodexQuotaSnapshot(async () => homes, fetchQuota)
			).load()
		)[0]?.status,
	).toBe("ok");
	expect(headers).toEqual([undefined]);
	for (const account_id of [42, {}, []]) {
		await writeFile(
			join(home, "auth.json"),
			JSON.stringify({ tokens: { access_token: "synthetic", account_id } }),
		);
		expect(
			(
				await (
					await captureCodexQuotaSnapshot(async () => homes, fetchQuota)
				).load()
			)[0]?.status,
		).toBe("unavailable");
	}
	expect(headers).toEqual([undefined]);
});
