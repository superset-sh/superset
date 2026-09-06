import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	API_BILLING_MARKER,
	claudeKeychainAccounts,
	discoverClaudeProfiles,
	discoverClaudeProfilesWithStatus,
	discoverCodexHomesWithStatus,
	keychainServicesForConfigDir,
	readClaudeLogin,
	readCodexProfileKind,
	readKeychainHits,
} from "./profiles";

// Claude Code keys its Keychain items on these names; a miss reads a sibling
// item (or nothing) and the login disappears from the quota panel.
describe("claudeKeychainAccounts", () => {
	it("uses $USER alone when it is set, as the CLI does", () => {
		expect(claudeKeychainAccounts({ USER: "avi" }, () => "passwd")).toEqual([
			"avi",
		]);
	});

	it("without $USER probes the passwd name and Bun's 'unknown' identity", () => {
		expect(claudeKeychainAccounts({}, () => "passwd")).toEqual([
			"passwd",
			"unknown",
		]);
		expect(claudeKeychainAccounts({ USER: "" }, () => "passwd")).toEqual([
			"passwd",
			"unknown",
		]);
	});

	it("swaps an unusable name for the CLI's fixed fallback", () => {
		expect(claudeKeychainAccounts({ USER: "not valid!" }, () => "x")).toEqual([
			"claude-code-user",
		]);
		expect(
			claudeKeychainAccounts({}, () => {
				throw new Error("no passwd entry");
			}),
		).toEqual(["claude-code-user", "unknown"]);
	});
});

const roots: string[] = [];

function tempProfile(): string {
	const root = mkdtempSync(join(tmpdir(), "superset-usage-profile-"));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("readCodexProfileKind", () => {
	it("classifies a marked home as API-billed without opening auth.json", async () => {
		const home = tempProfile();
		writeFileSync(join(home, API_BILLING_MARKER), "codex\n");
		// An unreadable auth.json (a directory) proves the key file is never
		// opened on this path.
		mkdirSync(join(home, "auth.json"));

		expect(await readCodexProfileKind(home)).toMatchObject({
			credentialKind: "api_key",
		});
	});

	it("fingerprints an API home by the marker's mtime so a re-login is visible", async () => {
		const home = tempProfile();
		const marker = join(home, API_BILLING_MARKER);
		writeFileSync(marker, "codex");
		utimesSync(marker, new Date(1_000_000), new Date(1_000_000));
		const first = (await readCodexProfileKind(home))?.loginFingerprint;
		utimesSync(marker, new Date(2_000_000), new Date(2_000_000));
		const second = (await readCodexProfileKind(home))?.loginFingerprint;

		expect(first).toBeTruthy();
		expect(second).toBeTruthy();
		expect(second).not.toBe(first);
	});

	it("classifies an OAuth token as a subscription", async () => {
		const home = tempProfile();
		writeFileSync(
			join(home, "auth.json"),
			JSON.stringify({ tokens: { access_token: "test-token" } }),
		);

		expect(await readCodexProfileKind(home)).toEqual({
			credentialKind: "subscription",
			loginFingerprint: null,
			accountId: null,
		});
	});

	it("ignores another agent's marker", async () => {
		const home = tempProfile();
		writeFileSync(join(home, API_BILLING_MARKER), "claude");
		expect(await readCodexProfileKind(home)).toBeNull();
	});

	it("ignores an unmarked API-key auth.json and a missing one", async () => {
		const home = tempProfile();
		expect(await readCodexProfileKind(home)).toBeNull();
		writeFileSync(
			join(home, "auth.json"),
			JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-test" }),
		);
		expect(await readCodexProfileKind(home)).toBeNull();
	});

	// KTD4: the Codex account identity is auth.json's `tokens.account_id`.
	it("reports the auth.json account id as the account identity", async () => {
		const home = tempProfile();
		writeFileSync(
			join(home, "auth.json"),
			JSON.stringify({
				tokens: { access_token: "t", account_id: "acct-1" },
			}),
		);

		expect(await readCodexProfileKind(home)).toEqual({
			credentialKind: "subscription",
			loginFingerprint: null,
			accountId: "acct-1",
		});
	});
});

describe("discoverClaudeProfiles", () => {
	it("surfaces a marked dir as API-billed even without an OAuth identity", async () => {
		const dir = tempProfile();
		writeFileSync(join(dir, API_BILLING_MARKER), "claude");

		const [profile] = await discoverClaudeProfiles([dir]);
		expect(profile).toMatchObject({
			configDir: dir,
			email: null,
			credentialKind: "api_key",
		});
		expect(profile?.loginFingerprint).toBeTruthy();
	});

	it("keeps an OAuth identity a subscription and skips dirs with neither", async () => {
		const subscription = tempProfile();
		writeFileSync(
			join(subscription, ".claude.json"),
			JSON.stringify({ oauthAccount: { emailAddress: "a@b.c" } }),
		);
		const empty = tempProfile();
		// A Codex API home sits in the same ~ dot-dir scan and must not
		// double as a Claude profile.
		const codexApi = tempProfile();
		writeFileSync(join(codexApi, API_BILLING_MARKER), "codex");

		const profiles = await discoverClaudeProfiles([
			subscription,
			empty,
			codexApi,
		]);
		expect(profiles).toHaveLength(1);
		expect(profiles[0]).toMatchObject({
			configDir: subscription,
			email: "a@b.c",
			credentialKind: "subscription",
			loginFingerprint: null,
		});
	});
});

/**
 * The quota store reaps every entry a discovery pass omits, so a pass that
 * stopped early has to say so: the walk gives up on its scan-time budget, and
 * a slow disk would otherwise read as "these accounts are gone".
 */
describe("discoverClaudeProfilesWithStatus", () => {
	function identityDir(email: string): string {
		const dir = tempProfile();
		writeFileSync(
			join(dir, ".claude.json"),
			JSON.stringify({ oauthAccount: { emailAddress: email } }),
		);
		return dir;
	}

	it("is complete when the walk reached every candidate", async () => {
		const candidates = [identityDir("a@b.c"), identityDir("d@e.f")];
		// A frozen clock can never exhaust the budget, so a slow machine
		// cannot turn this into the truncated case.
		const clock = spyOn(Date, "now").mockReturnValue(0);
		try {
			const { profiles, complete } =
				await discoverClaudeProfilesWithStatus(candidates);

			expect(profiles.map((profile) => profile.configDir)).toEqual(candidates);
			expect(complete).toBe(true);
		} finally {
			clock.mockRestore();
		}
	});

	it("is incomplete when the scan-time budget cut the walk short", async () => {
		const first = identityDir("a@b.c");
		const second = identityDir("d@e.f");
		// Walk start, the first candidate's check, then a check past the
		// 1.5s budget on the second.
		const readings = [0, 0];
		const clock = spyOn(Date, "now").mockImplementation(
			() => readings.shift() ?? 60_000,
		);
		try {
			const { profiles, complete } = await discoverClaudeProfilesWithStatus([
				first,
				second,
			]);

			expect(profiles.map((profile) => profile.configDir)).toEqual([first]);
			expect(complete).toBe(false);
		} finally {
			clock.mockRestore();
		}
	});
});

/**
 * The same reaping hazard on the Codex side: an unreadable home dir lists no
 * dot-dirs at all, which is exactly what a home holding none looks like.
 */
describe("discoverCodexHomesWithStatus", () => {
	const codexEnvKeys = [
		"CODEX_HOME",
		"SUPERSET_DEFAULT_CODEX_HOME",
		"SUPERSET_AMBIENT_CODEX_HOME",
	] as const;
	let previousCodexEnv: Array<string | undefined> = [];

	beforeEach(() => {
		previousCodexEnv = codexEnvKeys.map((key) => process.env[key]);
		for (const key of codexEnvKeys) delete process.env[key];
	});

	afterEach(() => {
		for (const [index, key] of codexEnvKeys.entries()) {
			const previous = previousCodexEnv[index];
			if (previous === undefined) delete process.env[key];
			else process.env[key] = previous;
		}
	});

	it("is complete when the home dir simply holds no extra homes", async () => {
		const home = tempProfile();

		const { homes, complete } = await discoverCodexHomesWithStatus({
			homeDir: home,
		});

		expect(homes.map((entry) => entry.home)).toEqual([join(home, ".codex")]);
		expect(complete).toBe(true);
	});

	it("is incomplete when the home dir could not be read", async () => {
		const home = join(tempProfile(), "gone");

		const { homes, complete } = await discoverCodexHomesWithStatus({
			homeDir: home,
		});

		// The default home is still reported; only the scan for siblings failed.
		expect(homes.map((entry) => entry.home)).toEqual([join(home, ".codex")]);
		expect(complete).toBe(false);
	});
});

/**
 * KTD4: accounts are keyed by the provider's account identity, and the
 * Superset-owned active dir is never one of them — it holds a copy of
 * whichever account is active, so discovering it would double-list that
 * account under the wrong dir.
 */
describe("discoverClaudeProfiles account identity", () => {
	let previousSupersetHome: string | undefined;

	beforeEach(() => {
		previousSupersetHome = process.env.SUPERSET_HOME_DIR;
	});

	afterEach(() => {
		if (previousSupersetHome === undefined) {
			delete process.env.SUPERSET_HOME_DIR;
		} else {
			process.env.SUPERSET_HOME_DIR = previousSupersetHome;
		}
	});

	it("carries the account id, so one token in two dirs is still two accounts", async () => {
		const first = tempProfile();
		const second = tempProfile();
		writeFileSync(
			join(first, ".claude.json"),
			JSON.stringify({
				oauthAccount: { emailAddress: "a@b.c", accountUuid: "uuid-a" },
			}),
		);
		writeFileSync(
			join(second, ".claude.json"),
			JSON.stringify({
				oauthAccount: { emailAddress: "d@e.f", accountUuid: "uuid-b" },
			}),
		);
		// The just-swapped state: both dirs hold the same access token.
		const credential = JSON.stringify({
			claudeAiOauth: { accessToken: "shared-token" },
		});
		writeFileSync(join(first, ".credentials.json"), credential);
		writeFileSync(join(second, ".credentials.json"), credential);

		const profiles = await discoverClaudeProfiles([first, second]);

		expect(profiles.map((profile) => profile.accountId)).toEqual([
			"uuid-a",
			"uuid-b",
		]);
	});

	it("never lists the active dir, even under ~/.config or behind a symlink", async () => {
		const root = tempProfile();
		process.env.SUPERSET_HOME_DIR = join(root, ".config", "superset");
		const activeDir = join(
			root,
			".config",
			"superset",
			"accounts",
			"claude-active",
		);
		mkdirSync(activeDir, { recursive: true });
		writeFileSync(
			join(activeDir, ".claude.json"),
			JSON.stringify({
				oauthAccount: { emailAddress: "active@b.c", accountUuid: "uuid-live" },
			}),
		);
		const alias = join(root, ".claude-active-alias");
		symlinkSync(activeDir, alias);
		const profile = tempProfile();
		writeFileSync(
			join(profile, ".claude.json"),
			JSON.stringify({ oauthAccount: { accountUuid: "uuid-profile" } }),
		);

		const profiles = await discoverClaudeProfiles([activeDir, alias, profile]);

		expect(profiles.map((entry) => entry.configDir)).toEqual([profile]);
	});
});

/**
 * The swap primitive writes back into the same store it read from, so the
 * read has to name it: which of the probed services matched, and under which
 * `-a` account attribute.
 */
describe("readKeychainHits", () => {
	function fakeSecurity(
		items: Array<{ account: string | null; secret: string }>,
	) {
		const calls: string[][] = [];
		const exec = async (args: string[]) => {
			calls.push(args);
			const accountIndex = args.indexOf("-a");
			const account = accountIndex === -1 ? null : args[accountIndex + 1];
			const hit = items.find((item) =>
				account === null ? true : item.account === account,
			);
			if (!hit) throw new Error("The specified item could not be found");
			return { stdout: `${hit.secret}\n`, stderr: "" };
		};
		return { exec, calls };
	}

	it("is empty off macOS and never shells out", async () => {
		const { exec, calls } = fakeSecurity([{ account: "avi", secret: "s" }]);
		expect(await readKeychainHits("svc", { exec, darwin: false })).toEqual([]);
		expect(calls).toEqual([]);
	});

	it("reports the account attribute that matched", async () => {
		const { exec } = fakeSecurity([
			{ account: process.env.USER ?? "avi", secret: '{"claudeAiOauth":{}}' },
		]);
		const hits = await readKeychainHits("svc", { exec, darwin: true });

		expect(hits).toHaveLength(1);
		expect(hits[0]?.account).toBe(process.env.USER ?? "avi");
		expect(hits[0]?.secret).toBe('{"claudeAiOauth":{}}');
	});

	it("marks a secret only the unscoped probe found as unattributed", async () => {
		const { exec } = fakeSecurity([{ account: "someone-else", secret: "s" }]);
		const hits = await readKeychainHits("svc", { exec, darwin: true });

		expect(hits).toEqual([{ account: null, secret: "s" }]);
	});
});

describe("readClaudeLogin", () => {
	const oauth = { claudeAiOauth: { accessToken: "t-a", expiresAt: 10 } };

	it("reads a profile dir's credential file and names the store", async () => {
		const dir = tempProfile();
		writeFileSync(join(dir, ".credentials.json"), JSON.stringify(oauth));

		const read = await readClaudeLogin(dir, { darwin: false });
		expect(read.source).toBe("file");
		expect(read.login).toEqual(oauth);
		expect(read.fileLogin).toEqual(oauth);
		expect(read.credentialsPath).toBe(join(dir, ".credentials.json"));
		expect(read.keychainService).toBeNull();
	});

	it("falls back to the Keychain item and reports its service and account", async () => {
		const dir = tempProfile();
		const service = keychainServicesForConfigDir(dir)[0] as string;
		const exec = async (args: string[]) => {
			const accountIndex = args.indexOf("-a");
			if (accountIndex === -1) throw new Error("not found");
			if (args[args.indexOf("-s") + 1] !== service) throw new Error("no item");
			return { stdout: JSON.stringify(oauth), stderr: "" };
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.source).toBe("keychain");
		expect(read.login).toEqual(oauth);
		expect(read.fileLogin).toBeNull();
		expect(read.keychainService).toBe(service);
		expect(read.keychainAccount).toBe(claudeKeychainAccounts()[0] ?? null);
	});

	it("points a null selection at the system-default store", async () => {
		const home = tempProfile();
		mkdirSync(join(home, ".claude"));
		writeFileSync(
			join(home, ".claude", ".credentials.json"),
			JSON.stringify(oauth),
		);

		const read = await readClaudeLogin(null, { darwin: false, homeDir: home });
		expect(read.credentialsPath).toBe(
			join(home, ".claude", ".credentials.json"),
		);
		expect(read.login).toEqual(oauth);
	});

	it("reports no login when neither store holds one", async () => {
		const read = await readClaudeLogin(tempProfile(), { darwin: false });
		expect(read.login).toBeNull();
		expect(read.fileLogin).toBeNull();
		expect(read.keychainLogin).toBeNull();
	});

	// A token-less `claudeAiOauth` is what a half-finished write leaves; read
	// as a login it lists a phantom account and a swap moves the empty object
	// into the active dir, signing the running session out.
	it("does not count an empty or token-less oauth block as a login", async () => {
		const dir = tempProfile();
		writeFileSync(
			join(dir, ".credentials.json"),
			JSON.stringify({ claudeAiOauth: {} }),
		);
		expect((await readClaudeLogin(dir, { darwin: false })).login).toBeNull();

		const partial = { claudeAiOauth: { accessToken: "t-a", refreshToken: "" } };
		writeFileSync(join(dir, ".credentials.json"), JSON.stringify(partial));
		const read = await readClaudeLogin(dir, { darwin: false });
		expect(read.login).toBeNull();
		expect(read.fileLogin).toBeNull();
		// The parsed file is still reported, so a later write keeps its siblings.
		expect(read.fileContent).toEqual(partial);
	});

	// Claude Code hashes the literal CLAUDE_CONFIG_DIR string, so a dir the
	// user re-spelled leaves a stale item under the old hash. Stopping at the
	// first service that hits would swap that months-old login in.
	it("keeps the freshest login across every config-dir spelling", async () => {
		const dir = tempProfile();
		const services = keychainServicesForConfigDir(dir);
		const [first, second] = services;
		const stale = {
			claudeAiOauth: {
				accessToken: "t-old",
				refreshToken: "r-old",
				expiresAt: 10,
				refreshTokenExpiresAt: 20,
			},
		};
		const fresh = {
			claudeAiOauth: {
				accessToken: "t-new",
				refreshToken: "r-new",
				expiresAt: 500,
				refreshTokenExpiresAt: 900,
			},
		};
		const exec = async (args: string[]) => {
			if (args.indexOf("-a") === -1) throw new Error("no unscoped item");
			const service = args[args.indexOf("-s") + 1];
			if (service === first)
				return { stdout: JSON.stringify(stale), stderr: "" };
			if (service === second)
				return { stdout: JSON.stringify(fresh), stderr: "" };
			throw new Error("The specified item could not be found");
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.login).toEqual(fresh);
		expect(read.keychainService).toBe(second as string);
		expect(read.keychainAccount).toBe(claudeKeychainAccounts()[0] ?? null);
	});

	// `~/.claude` and `~/.config/claude` are one login slot (fetchClaudeAccounts
	// reads both): a read that opened only the first calls a signed-in user
	// signed out, and a save-back would write where the CLI is not looking.
	it("reads the system default from ~/.config/claude and names that file", async () => {
		const home = tempProfile();
		mkdirSync(join(home, ".claude"));
		mkdirSync(join(home, ".config", "claude"), { recursive: true });
		const stale = {
			claudeAiOauth: {
				accessToken: "t-old",
				refreshToken: "r",
				expiresAt: 10,
				refreshTokenExpiresAt: 20,
			},
		};
		const fresh = {
			claudeAiOauth: {
				accessToken: "t-new",
				refreshToken: "r",
				expiresAt: 500,
				refreshTokenExpiresAt: 900,
			},
		};
		writeFileSync(
			join(home, ".claude", ".credentials.json"),
			JSON.stringify(stale),
		);
		writeFileSync(
			join(home, ".config", "claude", "credentials.json"),
			JSON.stringify(fresh),
		);

		const read = await readClaudeLogin(null, { darwin: false, homeDir: home });
		expect(read.login).toEqual(fresh);
		expect(read.credentialsPath).toBe(
			join(home, ".config", "claude", "credentials.json"),
		);
	});
});
