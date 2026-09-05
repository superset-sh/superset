import { afterEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	API_BILLING_MARKER,
	claudeKeychainAccounts,
	discoverClaudeProfiles,
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
});
