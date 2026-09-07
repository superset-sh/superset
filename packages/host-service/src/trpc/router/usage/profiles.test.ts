import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	truncateSync,
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

	// `complete` feeds the quota store's reaper, so the walk must only claim
	// it saw everything when it really did. `~/.config` that is absent is an
	// ordinary empty result; `~/.config` that is there but unreadable hides
	// every profile under it, and reporting that as complete reaps them.
	describe("with the whole home walk", () => {
		function homeWithTwoProfiles(): { home: string; dirs: string[] } {
			const home = tempProfile();
			const dirs = [
				join(home, ".claude-personal"),
				join(home, ".config", "claude-work"),
			];
			for (const dir of dirs) {
				mkdirSync(dir, { recursive: true });
				writeFileSync(
					join(dir, ".claude.json"),
					JSON.stringify({ oauthAccount: { emailAddress: "a@b.c" } }),
				);
			}
			return { home, dirs: dirs.sort() };
		}

		it("finds profiles under ~/.config and reports a whole walk", async () => {
			const { home, dirs } = homeWithTwoProfiles();
			const clock = spyOn(Date, "now").mockReturnValue(0);
			try {
				const { profiles, complete } = await discoverClaudeProfilesWithStatus(
					undefined,
					home,
				);

				expect(profiles.map((profile) => profile.configDir).sort()).toEqual(
					dirs,
				);
				expect(complete).toBe(true);
			} finally {
				clock.mockRestore();
			}
		});

		it("is incomplete when ~/.config exists but cannot be read", async () => {
			// root ignores the mode bits, so the denial this asserts on cannot
			// be staged; skipping beats passing without having tested anything.
			if (process.getuid?.() === 0) return;
			const { home } = homeWithTwoProfiles();
			const config = join(home, ".config");
			const clock = spyOn(Date, "now").mockReturnValue(0);
			chmodSync(config, 0o000);
			try {
				const { profiles, complete } = await discoverClaudeProfilesWithStatus(
					undefined,
					home,
				);

				expect(profiles.map((profile) => profile.configDir)).toEqual([
					join(home, ".claude-personal"),
				]);
				expect(complete).toBe(false);
			} finally {
				chmodSync(config, 0o755);
				clock.mockRestore();
			}
		});

		it("is incomplete when a candidate's state file cannot be read", async () => {
			if (process.getuid?.() === 0) return;
			const { home, dirs } = homeWithTwoProfiles();
			// An ordinary dot-dir holding no state file at all is the common
			// case and must not spoil the walk.
			mkdirSync(join(home, ".cache"));
			const hidden = dirs[1] as string;
			const clock = spyOn(Date, "now").mockReturnValue(0);
			chmodSync(join(hidden, ".claude.json"), 0o000);
			try {
				const { profiles, complete } = await discoverClaudeProfilesWithStatus(
					undefined,
					home,
				);

				expect(profiles.map((profile) => profile.configDir)).not.toContain(
					hidden,
				);
				expect(complete).toBe(false);
			} finally {
				chmodSync(join(hidden, ".claude.json"), 0o600);
				clock.mockRestore();
			}
		});

		// A state file past the parse cap is a profile that exists and cannot
		// be read, so it belongs with the case above and not with the
		// fail-open ones: the file only grows, so a reaper acting on a walk
		// called whole would delete a live account for good.
		it("is incomplete when a candidate's state file is past the size cap", async () => {
			const { home, dirs } = homeWithTwoProfiles();
			const hidden = dirs[1] as string;
			const clock = spyOn(Date, "now").mockReturnValue(0);
			// Sparse: reports 50 MB + 1 to stat without writing the bytes.
			truncateSync(join(hidden, ".claude.json"), 50 * 1024 * 1024 + 1);
			try {
				const { profiles, complete } = await discoverClaudeProfilesWithStatus(
					undefined,
					home,
				);

				expect(profiles.map((profile) => profile.configDir)).not.toContain(
					hidden,
				);
				expect(complete).toBe(false);
			} finally {
				clock.mockRestore();
			}
		});

		// Most dot-dirs in a home have nothing to do with Claude. One the user
		// cannot search would otherwise pin complete:false for the life of the
		// process and disable reaping entirely.
		it("stays complete when an unrelated dot-dir cannot be searched", async () => {
			if (process.getuid?.() === 0) return;
			const { home, dirs } = homeWithTwoProfiles();
			const opaque = join(home, ".docker");
			mkdirSync(opaque);
			const clock = spyOn(Date, "now").mockReturnValue(0);
			chmodSync(opaque, 0o000);
			try {
				const { profiles, complete } = await discoverClaudeProfilesWithStatus(
					undefined,
					home,
				);

				expect(profiles.map((profile) => profile.configDir).sort()).toEqual(
					dirs,
				);
				expect(complete).toBe(true);
			} finally {
				chmodSync(opaque, 0o755);
				clock.mockRestore();
			}
		});

		it("stays complete when ~/.config is simply absent", async () => {
			const home = tempProfile();
			const only = join(home, ".claude-personal");
			mkdirSync(only);
			writeFileSync(
				join(only, ".claude.json"),
				JSON.stringify({ oauthAccount: { emailAddress: "a@b.c" } }),
			);
			const clock = spyOn(Date, "now").mockReturnValue(0);
			try {
				const { profiles, complete } = await discoverClaudeProfilesWithStatus(
					undefined,
					home,
				);

				expect(profiles.map((profile) => profile.configDir)).toEqual([only]);
				expect(complete).toBe(true);
			} finally {
				clock.mockRestore();
			}
		});
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

	// The mirror of the Claude walk's rule. The default home reaches this with
	// no name filter at all, so one unsearchable dir would pin complete:false
	// and disable reaping for the whole codex agent.
	it("stays complete when a ~/.codex* dir cannot be searched", async () => {
		if (process.getuid?.() === 0) return;
		const home = tempProfile();
		const def = join(home, ".codex");
		mkdirSync(def);
		writeFileSync(
			join(def, "auth.json"),
			JSON.stringify({ tokens: { access_token: "t", account_id: "acct" } }),
		);
		const opaque = join(home, ".codex-old");
		mkdirSync(opaque);
		chmodSync(opaque, 0o000);

		try {
			const { homes, complete } = await discoverCodexHomesWithStatus({
				homeDir: home,
			});

			expect(homes.map((entry) => entry.home)).toContain(def);
			expect(complete).toBe(true);
		} finally {
			chmodSync(opaque, 0o755);
		}
	});

	it("is incomplete when the default home's auth.json cannot be read", async () => {
		if (process.getuid?.() === 0) return;
		const home = tempProfile();
		const def = join(home, ".codex");
		mkdirSync(def);
		const auth = join(def, "auth.json");
		writeFileSync(
			auth,
			JSON.stringify({ tokens: { access_token: "t", account_id: "acct" } }),
		);
		chmodSync(auth, 0o000);

		try {
			const { complete } = await discoverCodexHomesWithStatus({
				homeDir: home,
			});

			// Reporting it as a subscription home signed in as nobody, on a
			// walk that claims it saw everything, is the failure here.
			expect(complete).toBe(false);
		} finally {
			chmodSync(auth, 0o600);
		}
	});

	it("is incomplete when a sibling home's auth.json cannot be read", async () => {
		if (process.getuid?.() === 0) return;
		const home = tempProfile();
		const work = join(home, ".codex-work");
		mkdirSync(work);
		const auth = join(work, "auth.json");
		writeFileSync(
			auth,
			JSON.stringify({ tokens: { access_token: "t", account_id: "acct" } }),
		);
		chmodSync(auth, 0o000);

		try {
			const { homes, complete } = await discoverCodexHomesWithStatus({
				homeDir: home,
			});

			expect(homes.map((entry) => entry.home)).not.toContain(work);
			expect(complete).toBe(false);
		} finally {
			chmodSync(auth, 0o600);
		}
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
		expect(await readKeychainHits("svc", { exec, darwin: false })).toEqual({
			hits: [],
			failed: false,
		});
		expect(calls).toEqual([]);
	});

	it("reports the account attribute that matched", async () => {
		const { exec } = fakeSecurity([
			{ account: process.env.USER ?? "avi", secret: '{"claudeAiOauth":{}}' },
		]);
		const { hits, failed } = await readKeychainHits("svc", {
			exec,
			darwin: true,
		});

		expect(hits).toHaveLength(1);
		expect(hits[0]?.account).toBe(process.env.USER ?? "avi");
		expect(hits[0]?.secret).toBe('{"claudeAiOauth":{}}');
		expect(failed).toBe(false);
	});

	it("marks a secret only the unscoped probe found as unattributed", async () => {
		const { exec } = fakeSecurity([{ account: "someone-else", secret: "s" }]);
		const { hits } = await readKeychainHits("svc", { exec, darwin: true });

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

	// A swap merges the item's siblings back and the rollback restores them,
	// and both read keychainContent. Recording it only when it holds a login
	// left the write with nothing to merge, so it overwrote the item's
	// mcpOAuth tokens — and a failed verify deleted the item outright.
	// Renaming over the path needs only directory permission, so a caller that
	// cannot tell "denied" from "absent" replaces an intact store it never saw.
	it("reports a credential file that is present but unreadable", async () => {
		const denied = Object.assign(new Error("denied"), { code: "EACCES" });
		const read = async () => {
			throw denied;
		};

		const blocked = await readClaudeLogin(tempProfile(), {
			darwin: false,
			readFile: read as never,
		});
		expect(blocked.fileContent).toBeNull();
		expect(blocked.fileUnreadable).toBe(true);
	});

	// Only the store a write would target matters. The system default has two
	// candidate paths, and blocking on the one we would not write meant a user
	// with a leftover ~/.config/claude could not switch accounts at all — with
	// an error naming the file that was fine.
	it("ignores a torn sibling when the chosen store is intact", async () => {
		const home = tempProfile();
		mkdirSync(join(home, ".claude"));
		mkdirSync(join(home, ".config", "claude"), { recursive: true });
		writeFileSync(
			join(home, ".claude", ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: {
					accessToken: "good",
					refreshToken: "r",
					expiresAt: 9999,
				},
			}),
		);
		writeFileSync(join(home, ".config", "claude", "credentials.json"), "{half");

		const read = await readClaudeLogin(null, { darwin: false, homeDir: home });
		expect(read.credentialsPath).toBe(
			join(home, ".claude", ".credentials.json"),
		);
		expect(read.login?.claudeAiOauth?.accessToken).toBe("good");
		expect(read.fileUnreadable).toBe(false);
	});

	// The read question beside the write question, on the same slot: the
	// chosen store is intact so `fileUnreadable` must stay false — narrowing
	// the write guards is how this file produced a P0 — while a caller that
	// only wants to know whether the login it got may be the older of the two
	// halves is told that it may.
	it("flags a losing candidate it could not read without calling the write target unreadable", async () => {
		const home = tempProfile();
		mkdirSync(join(home, ".claude"));
		mkdirSync(join(home, ".config", "claude"), { recursive: true });
		writeFileSync(
			join(home, ".claude", ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: { accessToken: "good", refreshToken: "r", expiresAt: 1 },
			}),
		);
		writeFileSync(join(home, ".config", "claude", "credentials.json"), "{half");

		const read = await readClaudeLogin(null, { darwin: false, homeDir: home });
		expect(read.credentialsPath).toBe(
			join(home, ".claude", ".credentials.json"),
		);
		// Still writable, so a write over it is still allowed.
		expect(read.fileUnreadable).toBe(false);
		// But the half nobody read may have held the newer copy.
		expect(read.anyFileCandidateUnreadable).toBe(true);
	});

	// Absence is not unreadability on either side, or a default living in one
	// half of its slot with no Keychain item could never be swapped in.
	it("leaves both read flags false when a half is merely absent", async () => {
		const home = tempProfile();
		mkdirSync(join(home, ".config", "claude"), { recursive: true });
		writeFileSync(
			join(home, ".config", "claude", "credentials.json"),
			JSON.stringify(oauth),
		);
		// errSecItemNotFound: no item under the default service.
		const exec = async () => {
			throw Object.assign(new Error("Command failed: security"), { code: 44 });
		};

		const read = await readClaudeLogin(null, {
			darwin: true,
			exec,
			homeDir: home,
		});
		expect(read.login).toEqual(oauth);
		// `~/.claude` is not there and the Keychain item is not there.
		expect(read.anyFileCandidateUnreadable).toBe(false);
		expect(read.keychainUnreadable).toBe(false);
		expect(read.fileUnreadable).toBe(false);
	});

	it("stays unreadable when no candidate could be read", async () => {
		const home = tempProfile();
		mkdirSync(join(home, ".claude"));
		writeFileSync(join(home, ".claude", ".credentials.json"), "{half");

		const read = await readClaudeLogin(null, { darwin: false, homeDir: home });
		expect(read.login).toBeNull();
		expect(read.fileUnreadable).toBe(true);
	});

	it("treats a missing credential file as absent, not unreadable", async () => {
		const read = await readClaudeLogin(tempProfile(), { darwin: false });
		expect(read.fileContent).toBeNull();
		expect(read.fileUnreadable).toBe(false);
	});

	it("counts a credential file it cannot parse as unreadable", async () => {
		const dir = tempProfile();
		writeFileSync(join(dir, ".credentials.json"), "{half-writ");

		const read = await readClaudeLogin(dir, { darwin: false });
		expect(read.fileUnreadable).toBe(true);
	});

	// expiresAt moves forward on every refresh and every login, so it is the
	// write clock and orders the two stores; the refresh token's expiry only
	// moves when the token rotates, so it breaks ties. Asking whether EITHER
	// is newer is not an ordering — for {500,100} and {400,900} both
	// directions hold and the winner was whichever was probed last.
	it("breaks a tie on expiresAt with the newer refresh token", async () => {
		const dir = tempProfile();
		const service = keychainServicesForConfigDir(dir)[0] as string;
		writeFileSync(
			join(dir, ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: {
					accessToken: "FILE",
					refreshToken: "r",
					expiresAt: 400,
					refreshTokenExpiresAt: 100,
				},
			}),
		);
		const exec = async (args: string[]) => {
			if (args.indexOf("-a") === -1) throw new Error("not found");
			if (args[args.indexOf("-s") + 1] !== service)
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
			return {
				stdout: JSON.stringify({
					claudeAiOauth: {
						accessToken: "KEYCHAIN",
						refreshToken: "r",
						expiresAt: 400,
						refreshTokenExpiresAt: 9999,
					},
				}),
				stderr: "",
			};
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.source).toBe("keychain");
		expect(read.login?.claudeAiOauth?.accessToken).toBe("KEYCHAIN");
	});

	it("orders on expiresAt before the refresh token's expiry", async () => {
		const dir = tempProfile();
		const service = keychainServicesForConfigDir(dir)[0] as string;
		// The file is the later snapshot even though the keychain copy holds a
		// refresh token that outlives it.
		writeFileSync(
			join(dir, ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: {
					accessToken: "FILE",
					refreshToken: "r",
					expiresAt: 500,
					refreshTokenExpiresAt: 100,
				},
			}),
		);
		const exec = async (args: string[]) => {
			if (args.indexOf("-a") === -1) throw new Error("not found");
			if (args[args.indexOf("-s") + 1] !== service)
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
			return {
				stdout: JSON.stringify({
					claudeAiOauth: {
						accessToken: "KEYCHAIN",
						refreshToken: "r",
						expiresAt: 400,
						refreshTokenExpiresAt: 9999,
					},
				}),
				stderr: "",
			};
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.source).toBe("file");
		expect(read.login?.claudeAiOauth?.accessToken).toBe("FILE");
	});

	it("records a Keychain item that holds siblings but no login", async () => {
		const dir = tempProfile();
		const service = keychainServicesForConfigDir(dir)[0] as string;
		const siblings = { mcpOAuth: { "a-server": { token: "m-1" } } };
		const exec = async (args: string[]) => {
			if (args.indexOf("-a") === -1) throw new Error("not found");
			if (args[args.indexOf("-s") + 1] !== service)
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
			return { stdout: JSON.stringify(siblings), stderr: "" };
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.login).toBeNull();
		expect(read.keychainLogin).toBeNull();
		expect(read.keychainContent).toEqual(siblings);
		expect(read.keychainService).toBe(service);
		expect(read.keychainAccount).toBe(claudeKeychainAccounts()[0] ?? null);
	});

	it("falls back to the Keychain item and reports its service and account", async () => {
		const dir = tempProfile();
		const service = keychainServicesForConfigDir(dir)[0] as string;
		const exec = async (args: string[]) => {
			const accountIndex = args.indexOf("-a");
			if (accountIndex === -1) throw new Error("not found");
			if (args[args.indexOf("-s") + 1] !== service)
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
			return { stdout: JSON.stringify(oauth), stderr: "" };
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.source).toBe("keychain");
		expect(read.login).toEqual(oauth);
		expect(read.fileLogin).toBeNull();
		expect(read.keychainService).toBe(service);
		expect(read.keychainAccount).toBe(claudeKeychainAccounts()[0] ?? null);
	});

	// A probe rejects both when the item is not there and when nobody answered
	// its prompt or the 5s timeout killed it, and either way keychainContent is
	// null. A caller that writes has to tell them apart: the write replaces the
	// item in place with no backup, and the rollback deletes it.
	it("reports a Keychain probe that failed for anything but an absent item", async () => {
		const exec = async () => {
			const error = new Error("Command failed: security find-generic-password");
			Object.assign(error, { killed: true, signal: "SIGTERM" });
			throw error;
		};

		const read = await readClaudeLogin(tempProfile(), { darwin: true, exec });
		expect(read.keychainUnreadable).toBe(true);
		expect(read.keychainContent).toBeNull();
	});

	it("reports an absent Keychain item as read, not as unreadable", async () => {
		const byStatus = async () => {
			// errSecItemNotFound, which is all `security -w` prints on stderr.
			throw Object.assign(new Error("Command failed: security"), { code: 44 });
		};
		const byMessage = async () => {
			throw new Error(
				"security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.",
			);
		};

		for (const exec of [byStatus, byMessage]) {
			const read = await readClaudeLogin(tempProfile(), { darwin: true, exec });
			expect(read.keychainUnreadable).toBe(false);
			expect(read.keychainContent).toBeNull();
		}
	});

	// `keychainService` is whichever spelling held the freshest item that DID
	// parse, so a refusal that named it pointed the user at the one item that
	// needed nothing done to it. The failing spellings are recorded separately
	// because they are the ones there is something to do about.
	it("names the spelling whose probe failed, not the one it read", async () => {
		const dir = tempProfile();
		const spellings = keychainServicesForConfigDir(dir);
		const denied = spellings[0] as string;
		const answering = spellings[1] as string;
		const exec = async (args: string[]) => {
			if (args[args.indexOf("-s") + 1] === denied) {
				// A denied or unanswered prompt, or the 5s timeout.
				throw Object.assign(new Error("Command failed: security"), {
					killed: true,
					signal: "SIGTERM",
				});
			}
			if (args.indexOf("-a") === -1) {
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
			}
			return { stdout: `${JSON.stringify(oauth)}\n`, stderr: "" };
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.keychainService).toBe(answering);
		expect(read.keychainUnreadable).toBe(true);
		expect(read.keychainUnreadableServices).toEqual([denied]);
	});

	it("names the spelling whose item would not parse", async () => {
		const dir = tempProfile();
		const spellings = keychainServicesForConfigDir(dir);
		const torn = spellings[0] as string;
		const answering = spellings[1] as string;
		const exec = async (args: string[]) => {
			if (args.indexOf("-a") === -1) {
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
			}
			return args[args.indexOf("-s") + 1] === torn
				? { stdout: "sk-ant-oat01-BARE\n", stderr: "" }
				: { stdout: `${JSON.stringify(oauth)}\n`, stderr: "" };
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.keychainService).toBe(answering);
		expect(read.keychainUnreadableServices).toEqual([torn]);
	});

	// Bytes that came back whole but would not parse are the same danger as a
	// probe that never answered: the item is there, the write replaces it in
	// place with no backup, and the rollback deletes it.
	it("reports an unparseable Keychain secret as unreadable, not absent", async () => {
		const dir = tempProfile();
		const service = keychainServicesForConfigDir(dir)[0] as string;
		const exec = async (args: string[]) => {
			if (args.indexOf("-a") === -1) throw new Error("not found");
			if (args[args.indexOf("-s") + 1] !== service)
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
			// An item holding a bare token rather than the JSON object.
			return { stdout: "sk-ant-oat01-BARE\n", stderr: "" };
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.keychainUnreadable).toBe(true);
		expect(read.keychainContent).toBeNull();
	});

	// The permitted half of the same guard: an item that parses but records no
	// login is an ordinary state — it is the write target and its siblings are
	// merged — so it must not be mistaken for one we could not read.
	it("reports a parseable Keychain item with no login as readable", async () => {
		const dir = tempProfile();
		const service = keychainServicesForConfigDir(dir)[0] as string;
		const siblings = { mcpOAuth: { "a-server": { token: "m-1" } } };
		const exec = async (args: string[]) => {
			if (args.indexOf("-a") === -1) throw new Error("not found");
			if (args[args.indexOf("-s") + 1] !== service)
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
			return { stdout: JSON.stringify(siblings), stderr: "" };
		};

		const read = await readClaudeLogin(dir, { darwin: true, exec });
		expect(read.keychainUnreadable).toBe(false);
		expect(read.keychainContent).toEqual(siblings);
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
			if (args.indexOf("-a") === -1)
				throw new Error(
					"The specified item could not be found in the keychain.",
				);
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
