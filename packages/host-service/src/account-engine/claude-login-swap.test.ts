import { afterEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
	claudeKeychainAccounts,
	keychainServicesForConfigDir,
} from "../trpc/router/usage/profiles";
import {
	type ClaudeSwapDeps,
	seedActiveClaudeLogin,
	swapClaudeLogin,
} from "./claude-login-swap";

const roots: string[] = [];

function tempRoot(name: string): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), `superset-${name}-`)));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function oauth(token: string, expiresAt = 1_000): Record<string, unknown> {
	return {
		accessToken: token,
		refreshToken: `refresh-${token}`,
		expiresAt,
		refreshTokenExpiresAt: expiresAt + 10_000,
		scopes: ["user:inference"],
		subscriptionType: "max",
	};
}

function identity(name: string): Record<string, unknown> {
	return {
		oauthAccount: {
			accountUuid: `uuid-${name}`,
			emailAddress: `${name}@example.com`,
		},
		userID: `user-${name}`,
	};
}

interface Fixture {
	home: string;
	superset: string;
	activeDir: string;
	profileA: string;
	profileB: string;
	systemDefault: string;
	deps: ClaudeSwapDeps;
}

function makeDir(path: string): string {
	mkdirSync(path, { recursive: true });
	chmodSync(path, 0o700);
	return path;
}

function writeCredentials(dir: string, body: Record<string, unknown>): void {
	writeFileSync(join(dir, ".credentials.json"), JSON.stringify(body), {
		mode: 0o600,
	});
}

function readCredentials(dir: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(dir, ".credentials.json"), "utf-8"));
}

function fixture(): Fixture {
	const home = tempRoot("swap-home");
	const superset = tempRoot("swap-superset");
	const activeDir = makeDir(join(superset, "accounts", "claude-active"));
	const profileA = makeDir(join(home, ".claude-a"));
	const profileB = makeDir(join(home, ".claude-b"));
	const systemDefault = makeDir(join(home, ".claude"));

	// A is the account currently live in the active dir, and Claude Code has
	// refreshed its token there since the profile dir was last written.
	writeCredentials(activeDir, {
		claudeAiOauth: oauth("t-a-refreshed", 5_000),
		mcpOAuth: { "active-server": { token: "m-active" } },
	});
	writeFileSync(
		join(activeDir, ".claude.json"),
		JSON.stringify({
			...identity("a"),
			hasCompletedOnboarding: true,
			projects: { "/tmp/session": { hasTrustDialogAccepted: true } },
		}),
	);
	writeCredentials(profileA, {
		claudeAiOauth: oauth("t-a", 1_000),
		mcpOAuth: { "a-server": { token: "m-a" } },
	});
	writeFileSync(join(profileA, ".claude.json"), JSON.stringify(identity("a")));
	writeCredentials(profileB, { claudeAiOauth: oauth("t-b", 2_000) });
	writeFileSync(join(profileB, ".claude.json"), JSON.stringify(identity("b")));

	return {
		home,
		superset,
		activeDir,
		profileA,
		profileB,
		systemDefault,
		deps: { homeDir: home, supersetHomeDir: superset, darwin: false },
	};
}

const asProfile = (dir: string) => ({ kind: "profile" as const, dir });
const SYSTEM_DEFAULT = { kind: "system-default" as const };

describe("swapClaudeLogin on a file-backed store", () => {
	it("moves the target login in and keeps the active dir's other state", async () => {
		const f = fixture();

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error(result.reason);
		expect(result.identity.accountUuid).toBe("uuid-b");
		expect(result.identity.emailAddress).toBe("b@example.com");

		const credentials = readCredentials(f.activeDir);
		expect(credentials.claudeAiOauth).toEqual(oauth("t-b", 2_000));
		expect(credentials.mcpOAuth).toEqual({
			"active-server": { token: "m-active" },
		});
		expect(statSync(join(f.activeDir, ".credentials.json")).mode & 0o777).toBe(
			0o600,
		);

		const state = JSON.parse(
			readFileSync(join(f.activeDir, ".claude.json"), "utf-8"),
		);
		expect(state.oauthAccount).toEqual(identity("b").oauthAccount);
		expect(state.userID).toBe("user-b");
		expect(state.hasCompletedOnboarding).toBe(true);
		expect(state.projects["/tmp/session"].hasTrustDialogAccepted).toBe(true);
	});

	it("drops an identity key the target account does not carry", async () => {
		const f = fixture();
		// B never signed in with a userID; A's must not survive the swap.
		writeFileSync(
			join(f.profileB, ".claude.json"),
			JSON.stringify({ oauthAccount: identity("b").oauthAccount }),
		);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result.ok).toBe(true);
		const state = JSON.parse(
			readFileSync(join(f.activeDir, ".claude.json"), "utf-8"),
		);
		expect(state.userID).toBeUndefined();
		expect(state.oauthAccount).toEqual(identity("b").oauthAccount);
		expect(state.projects["/tmp/session"].hasTrustDialogAccepted).toBe(true);
	});

	it("saves the active dir's refreshed login back to its owner only", async () => {
		const f = fixture();

		await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		const owner = readCredentials(f.profileA);
		expect(owner.claudeAiOauth).toEqual(oauth("t-a-refreshed", 5_000));
		expect(owner.mcpOAuth).toEqual({ "a-server": { token: "m-a" } });
		// The owner's identity file is never rewritten by a swap.
		expect(
			JSON.parse(readFileSync(join(f.profileA, ".claude.json"), "utf-8")),
		).toEqual(identity("a"));
	});

	it("never writes into an unmanaged owner store", async () => {
		const f = fixture();
		const before = readFileSync(join(f.profileA, ".credentials.json"), "utf-8");

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			ownerManaged: false,
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result.ok).toBe(true);
		// The refreshed login in the active dir is dropped rather than saved
		// back: a hand-exported dir is Superset's to read, never to write.
		expect(readFileSync(join(f.profileA, ".credentials.json"), "utf-8")).toBe(
			before,
		);
		// ...and no 0600 backup lands beside it either.
		expect(readdirSync(f.profileA).sort()).toEqual([
			".claude.json",
			".credentials.json",
		]);
		// The swap itself still happened.
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
	});

	it("never regresses an owner login that is already newer", async () => {
		const f = fixture();
		writeCredentials(f.profileA, {
			claudeAiOauth: oauth("t-a-newest", 9_000),
			mcpOAuth: { "a-server": { token: "m-a" } },
		});

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result.ok).toBe(true);
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(
			oauth("t-a-newest", 9_000),
		);
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
	});

	it("refuses without an owner binding and leaves every store untouched", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: undefined,
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toEqual({
			ok: false,
			code: "owner-unknown",
			reason: expect.any(String),
		});
		expect(readCredentials(f.activeDir)).toEqual(before);
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(oauth("t-a"));
	});

	it("refuses a group-writable owner dir before writing anything", async () => {
		const f = fixture();
		chmodSync(f.profileA, 0o770);
		const before = readCredentials(f.activeDir);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "invalid-owner" });
		expect(readCredentials(f.activeDir)).toEqual(before);
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(oauth("t-a"));
	});

	it("refuses a symlinked active dir and skips the save-back", async () => {
		const f = fixture();
		const real = makeDir(join(f.superset, "accounts", "real-active"));
		writeCredentials(real, { claudeAiOauth: oauth("t-a-refreshed", 5_000) });
		const linked = join(f.superset, "accounts", "linked-active");
		symlinkSync(real, linked);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: linked,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "invalid-active-dir" });
		expect(readCredentials(real).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(oauth("t-a"));
	});

	it("re-validates the active dir after the save-back", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				rename: async (from: string, to: string) => {
					const { rename } = await import("node:fs/promises");
					await rename(from, to);
					// The dir loses its exclusive mode between the two writes.
					if (to.startsWith(f.profileA)) chmodSync(f.activeDir, 0o777);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: false, code: "invalid-active-dir" });
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	it("retries once when the source changes under it", async () => {
		const f = fixture();
		let reads = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					if (path === join(f.profileB, ".credentials.json") && ++reads === 2) {
						writeCredentials(f.profileB, {
							claudeAiOauth: oauth("t-b-rotated", 3_000),
						});
					}
					return readFile(path, encoding);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result.ok).toBe(true);
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b-rotated", 3_000),
		);
	});

	it("aborts when the source keeps changing, leaving the active dir alone", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);
		let reads = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					if (path === join(f.profileB, ".credentials.json") && reads++ > 0) {
						writeCredentials(f.profileB, {
							claudeAiOauth: oauth(`t-b-${reads}`, 3_000),
						});
					}
					return readFile(path, encoding);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: false, code: "source-changed" });
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	it("leaves the previous login in place when the write fails (AE13)", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				writeFile: async (path: string) => {
					if (path.startsWith(join(f.activeDir, ".credentials.json"))) {
						throw new Error("ENOSPC: no space left on device");
					}
					const { writeFile } = await import("node:fs/promises");
					await writeFile(path, "");
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: false, code: "write-failed" });
		expect(readCredentials(f.activeDir)).toEqual(before);
		expect(
			JSON.parse(readFileSync(join(f.activeDir, ".claude.json"), "utf-8"))
				.oauthAccount,
		).toEqual(identity("a").oauthAccount);
	});

	// AE13 again, one step later: a credential written while the identity was
	// not is the state a later save-back reads as the previous account's login.
	it("rolls the credential back when the identity write fails", async () => {
		const f = fixture();
		// A directory in the state file's place fails every read and rename.
		rmSync(join(f.activeDir, ".claude.json"));
		mkdirSync(join(f.activeDir, ".claude.json"));

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "write-failed" });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
	});

	// Nothing to restore is not nothing to undo: leaving the credential the
	// swap created behind signs the dir in as the target with the previous
	// account's identity still on it.
	it("removes the credential it created when there is none to restore", async () => {
		const f = fixture();
		rmSync(join(f.activeDir, ".credentials.json"));
		rmSync(join(f.activeDir, ".claude.json"));
		mkdirSync(join(f.activeDir, ".claude.json"));

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "write-failed" });
		expect(readdirSync(f.activeDir)).not.toContain(".credentials.json");
	});

	it("reports split state when the rollback fails too", async () => {
		const f = fixture();
		rmSync(join(f.activeDir, ".claude.json"));
		mkdirSync(join(f.activeDir, ".claude.json"));
		let credentialWrites = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				writeFile: async (
					path: string,
					data: string,
					options: { mode: number; flag: string },
				) => {
					// The forward write lands; the rollback's does not.
					if (
						path.startsWith(join(f.activeDir, ".credentials.json")) &&
						path.endsWith(".tmp") &&
						++credentialWrites === 2
					) {
						throw new Error("EROFS: read-only file system");
					}
					const { writeFile } = await import("node:fs/promises");
					await writeFile(path, data, options);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: false, code: "split-state" });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
	});

	// A `/login` inside a live session leaves an account in the active dir that
	// the engine's binding does not name; saving it back signs the owner out.
	it("refuses the save-back when the active login is another account's", async () => {
		const f = fixture();
		writeCredentials(f.activeDir, { claudeAiOauth: oauth("t-c-fresh", 8_000) });
		writeFileSync(
			join(f.activeDir, ".claude.json"),
			JSON.stringify(identity("c")),
		);
		const before = readCredentials(f.activeDir);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			expectedOwnerAccountId: "uuid-a",
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "owner-unknown" });
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(oauth("t-a"));
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	// An identity that cannot be read names no account, so the login beside it
	// cannot be confirmed as the owner's — and saving a stranger's login into
	// the owner's store signs the owner out just as surely as a known mismatch.
	it("refuses the save-back when the active identity cannot be read", async () => {
		const f = fixture();
		writeFileSync(join(f.activeDir, ".claude.json"), "{not json");
		const before = readCredentials(f.activeDir);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			expectedOwnerAccountId: "uuid-a",
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "owner-unknown" });
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(oauth("t-a"));
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	// ...unless there is no login there at all: nothing gets saved back, so an
	// unreadable identity costs the owner nothing.
	it("swaps on an unreadable identity when there is no login to save back", async () => {
		const f = fixture();
		rmSync(join(f.activeDir, ".credentials.json"));
		writeFileSync(join(f.activeDir, ".claude.json"), "{not json");

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			expectedOwnerAccountId: "uuid-a",
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(oauth("t-a"));
	});

	it("saves back as usual when the active identity is the expected owner", async () => {
		const f = fixture();

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			expectedOwnerAccountId: "uuid-a",
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
	});

	it("fails the verify step when the store does not read back as the target", async () => {
		const f = fixture();
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				writeFile: async (path: string, data: string, options: unknown) => {
					const { writeFile } = await import("node:fs/promises");
					const corrupted = path.includes(".credentials.json")
						? JSON.stringify({ claudeAiOauth: oauth("t-wrong") })
						: data;
					await writeFile(
						path,
						corrupted,
						options as { mode: number; flag: string },
					);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: false, code: "verify-failed" });
	});

	// The running CLI refreshes the login the swap just wrote before the
	// read-back sees it. The swap did land — the dir holds the target's own
	// token, one refresh newer — so undoing it would sign the caller out of
	// the account it just asked for.
	it("accepts a read-back the target's own session refreshed", async () => {
		const f = fixture();
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				rename: async (from: string, to: string) => {
					const { rename } = await import("node:fs/promises");
					await rename(from, to);
					if (to === join(f.activeDir, ".credentials.json")) {
						writeCredentials(f.activeDir, {
							claudeAiOauth: oauth("t-b-refreshed", 6_000),
						});
					}
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error(result.reason);
		expect(result.identity.accountUuid).toBe("uuid-b");
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b-refreshed", 6_000),
		);
	});

	// A `/login` landing between the write and the read-back leaves a third
	// account in the active dir while the caller still believes the previous
	// one is live: put the dir's own snapshot back rather than leave the two
	// disagreeing.
	it("rolls the write back when the dir verifies as another account", async () => {
		const f = fixture();
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					// Only the verify step reads the active dir's identity here.
					if (path === join(f.activeDir, ".claude.json")) {
						writeCredentials(f.activeDir, {
							claudeAiOauth: oauth("t-c", 9_000),
						});
						writeFileSync(path, JSON.stringify(identity("c")));
					}
					return readFile(path, encoding);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: false, code: "verify-failed" });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
	});

	it("replaces a symlinked .credentials.json with a real file", async () => {
		const f = fixture();
		const decoy = join(f.home, "decoy-credentials.json");
		writeFileSync(decoy, JSON.stringify({ claudeAiOauth: oauth("t-decoy") }));
		rmSync(join(f.activeDir, ".credentials.json"));
		symlinkSync(decoy, join(f.activeDir, ".credentials.json"));

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result.ok).toBe(true);
		const { lstatSync } = await import("node:fs");
		expect(
			lstatSync(join(f.activeDir, ".credentials.json")).isSymbolicLink(),
		).toBe(false);
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
		expect(JSON.parse(readFileSync(decoy, "utf-8")).claudeAiOauth).toEqual(
			oauth("t-decoy"),
		);
	});

	it("keeps at most three owner-only backups per dir", async () => {
		const f = fixture();
		let clock = 1_700_000_000_000;
		const deps: ClaudeSwapDeps = { ...f.deps, now: () => (clock += 1_000) };
		for (let round = 0; round < 4; round++) {
			const forward = round % 2 === 0;
			const result = await swapClaudeLogin({
				target: asProfile(forward ? f.profileB : f.profileA),
				ownerBinding: asProfile(forward ? f.profileA : f.profileB),
				activeDir: f.activeDir,
				deps,
			});
			expect(result.ok).toBe(true);
		}

		const backups = readdirSync(f.activeDir).filter((name) =>
			name.startsWith(".credentials.json."),
		);
		expect(backups).toHaveLength(3);
		for (const name of backups) {
			expect(statSync(join(f.activeDir, name)).mode & 0o777).toBe(0o600);
		}
	});

	// $SUPERSET_HOME_DIR is a user-supplied string: spelled with a trailing
	// slash it used to make every dir under it "outside the Superset home".
	it("accepts an active dir under a Superset home spelled with a trailing slash", async () => {
		const f = fixture();

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, supersetHomeDir: `${f.superset}${sep}` },
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
	});

	// The source hash has to see the whole login: a change nested inside
	// `claudeAiOauth` used to hash identically, so the stale copy was written.
	it("picks up a change nested inside the source login", async () => {
		const f = fixture();
		writeCredentials(f.profileB, {
			claudeAiOauth: {
				...oauth("t-b", 2_000),
				organization: { uuid: "org-1", name: "one" },
			},
		});
		let reads = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					if (path === join(f.profileB, ".credentials.json") && reads++ === 1) {
						writeCredentials(f.profileB, {
							claudeAiOauth: {
								...oauth("t-b", 2_000),
								organization: { uuid: "org-2", name: "two" },
							},
						});
					}
					return readFile(path, encoding);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(f.activeDir).claudeAiOauth).toMatchObject({
			organization: { uuid: "org-2", name: "two" },
		});
	});

	it("does not read a key reorder, nested included, as a change", async () => {
		const f = fixture();
		const reorder = (value: Record<string, unknown>) =>
			Object.fromEntries(Object.entries(value).reverse());
		writeCredentials(f.profileB, {
			claudeAiOauth: { ...oauth("t-b", 2_000), organization: { a: 1, b: 2 } },
		});
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					if (path === join(f.profileB, ".credentials.json")) {
						// Rewritten in a different order on every single read.
						const current = readCredentials(f.profileB).claudeAiOauth as Record<
							string,
							unknown
						>;
						writeCredentials(f.profileB, {
							claudeAiOauth: reorder({
								...current,
								organization: reorder(
									current.organization as Record<string, unknown>,
								),
							}),
						});
					}
					return readFile(path, encoding);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: true });
	});

	// A `/login` in the target between the identity read and the write would
	// pair one account's credential with another account's identity.
	it("aborts when the target is signed in again mid-swap", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);
		let reads = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					if (path === join(f.profileB, ".credentials.json") && reads++ === 1) {
						writeCredentials(f.profileB, {
							claudeAiOauth: oauth("t-c", 9_000),
						});
						writeFileSync(
							join(f.profileB, ".claude.json"),
							JSON.stringify(identity("c")),
						);
					}
					return readFile(path, encoding);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: false, code: "target-changed" });
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	// The caller's picture of the target is as old as its last poll: a profile
	// re-authenticated as somebody else since then must not be swapped in
	// under the account the caller asked for.
	it("refuses a target signed in as an account the caller did not ask for", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);
		writeFileSync(
			join(f.profileB, ".claude.json"),
			JSON.stringify(identity("c")),
		);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			expectedTargetAccountId: "uuid-b",
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "target-changed" });
		expect(readCredentials(f.activeDir)).toEqual(before);
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(oauth("t-a"));
	});

	it("refuses a target with no login and one with no identity", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);
		const empty = makeDir(join(f.home, ".claude-empty"));

		expect(
			await swapClaudeLogin({
				target: asProfile(empty),
				ownerBinding: asProfile(f.profileA),
				activeDir: f.activeDir,
				deps: f.deps,
			}),
		).toMatchObject({ ok: false, code: "no-target-login" });

		writeCredentials(empty, { claudeAiOauth: oauth("t-empty") });
		expect(
			await swapClaudeLogin({
				target: asProfile(empty),
				ownerBinding: asProfile(f.profileA),
				activeDir: f.activeDir,
				deps: f.deps,
			}),
		).toMatchObject({ ok: false, code: "no-target-identity" });
		expect(readCredentials(f.activeDir)).toEqual(before);
	});
});

describe("swapClaudeLogin with the system-default account", () => {
	it("saves the system default's own login back into ~/.claude and swaps it back in", async () => {
		const f = fixture();
		writeCredentials(f.systemDefault, {
			claudeAiOauth: oauth("t-sys", 1_000),
			mcpOAuth: { "sys-server": { token: "m-sys" } },
		});
		writeFileSync(
			join(f.home, ".claude.json"),
			JSON.stringify({ ...identity("sys"), hasCompletedOnboarding: true }),
		);
		// The active dir currently runs the system-default login, refreshed.
		writeCredentials(f.activeDir, {
			claudeAiOauth: oauth("t-sys-refreshed", 5_000),
			mcpOAuth: { "active-server": { token: "m-active" } },
		});
		writeFileSync(
			join(f.activeDir, ".claude.json"),
			JSON.stringify(identity("sys")),
		);

		const away = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: SYSTEM_DEFAULT,
			activeDir: f.activeDir,
			deps: f.deps,
		});
		expect(away.ok).toBe(true);
		const saved = readCredentials(f.systemDefault);
		expect(saved.claudeAiOauth).toEqual(oauth("t-sys-refreshed", 5_000));
		expect(saved.mcpOAuth).toEqual({ "sys-server": { token: "m-sys" } });
		expect(
			JSON.parse(readFileSync(join(f.home, ".claude.json"), "utf-8")).userID,
		).toBe("user-sys");

		const back = await swapClaudeLogin({
			target: SYSTEM_DEFAULT,
			ownerBinding: asProfile(f.profileB),
			activeDir: f.activeDir,
			deps: f.deps,
		});
		expect(back).toMatchObject({ ok: true });
		if (!back.ok) throw new Error(back.reason);
		expect(back.identity.accountUuid).toBe("uuid-sys");
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-sys-refreshed", 5_000),
		);
	});
});

interface KeychainItem {
	service: string;
	account: string;
	secret: string;
}

function fakeKeychain(items: KeychainItem[]) {
	const calls: Array<{ args: string[]; stdin?: string }> = [];
	const unquote = (token: string) =>
		token.startsWith('"')
			? token.slice(1, -1).replace(/\\(["\\])/g, "$1")
			: token;
	const splitArgs = (line: string): string[] => {
		const tokens = line.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
		return tokens.map(unquote);
	};
	const exec = async (args: string[], stdin?: string) => {
		calls.push({ args, stdin });
		if (args[0] === "-i") {
			for (const line of (stdin ?? "").split("\n").filter(Boolean)) {
				const parsed = splitArgs(line);
				if (parsed[0] !== "add-generic-password") throw new Error("unknown");
				const account = parsed[parsed.indexOf("-a") + 1] as string;
				const service = parsed[parsed.indexOf("-s") + 1] as string;
				const secret = parsed[parsed.indexOf("-w") + 1] as string;
				const existing = items.find(
					(item) => item.service === service && item.account === account,
				);
				if (existing) existing.secret = secret;
				else items.push({ service, account, secret });
			}
			return { stdout: "", stderr: "" };
		}
		const service = args[args.indexOf("-s") + 1];
		const accountIndex = args.indexOf("-a");
		const account = accountIndex === -1 ? null : args[accountIndex + 1];
		const hit = items.find(
			(item) =>
				item.service === service &&
				(account === null || item.account === account),
		);
		if (!hit) throw new Error("The specified item could not be found");
		if (args.includes("-g")) {
			return {
				stdout: `password: "${hit.secret}"\n`,
				stderr: `keychain: "login.keychain-db"\nattributes:\n    "acct"<blob>="${hit.account}"\n    "svce"<blob>="${hit.service}"\n`,
			};
		}
		return { stdout: `${hit.secret}\n`, stderr: "" };
	};
	return { exec, calls, items };
}

describe("swapClaudeLogin on macOS (injected security exec)", () => {
	it("writes the secret on stdin under the matched service and account", async () => {
		const f = fixture();
		rmSync(join(f.activeDir, ".credentials.json"));
		rmSync(join(f.profileA, ".credentials.json"));
		rmSync(join(f.profileB, ".credentials.json"));
		const activeService = keychainServicesForConfigDir(
			f.activeDir,
		)[0] as string;
		const account = claudeKeychainAccounts()[0] as string;
		const keychain = fakeKeychain([
			{
				service: activeService,
				account,
				secret: JSON.stringify({
					claudeAiOauth: oauth("t-a-refreshed", 5_000),
					mcpOAuth: { "active-server": { token: "m-active" } },
				}),
			},
			{
				service: keychainServicesForConfigDir(f.profileA)[0] as string,
				account,
				secret: JSON.stringify({ claudeAiOauth: oauth("t-a", 1_000) }),
			},
			{
				service: keychainServicesForConfigDir(f.profileB)[0] as string,
				account,
				secret: JSON.stringify({ claudeAiOauth: oauth("t-b", 2_000) }),
			},
		]);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, darwin: true, exec: keychain.exec },
		});

		expect(result).toMatchObject({ ok: true });
		const active = keychain.items.find(
			(item) => item.service === activeService,
		);
		expect(JSON.parse(active?.secret ?? "{}")).toEqual({
			claudeAiOauth: oauth("t-b", 2_000),
			mcpOAuth: { "active-server": { token: "m-active" } },
		});
		const owner = keychain.items.find(
			(item) => item.service === keychainServicesForConfigDir(f.profileA)[0],
		);
		expect(JSON.parse(owner?.secret ?? "{}").claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);

		const writes = keychain.calls.filter((call) => call.args[0] === "-i");
		expect(writes.length).toBeGreaterThan(0);
		for (const call of keychain.calls) {
			expect(call.args.join(" ")).not.toContain("t-b");
			expect(call.args.join(" ")).not.toContain("t-a-refreshed");
		}
		expect(writes.some((call) => call.stdin?.includes("t-b"))).toBe(true);
		// No credential file is invented beside the Keychain item.
		expect(readdirSync(f.activeDir)).not.toContain(".credentials.json");
	});

	it("resolves an unattributed item's account before writing", async () => {
		const f = fixture();
		rmSync(join(f.activeDir, ".credentials.json"));
		const activeService = keychainServicesForConfigDir(
			f.activeDir,
		)[0] as string;
		const keychain = fakeKeychain([
			{
				service: activeService,
				account: "legacy-account",
				secret: JSON.stringify({
					claudeAiOauth: oauth("t-a-refreshed", 5_000),
				}),
			},
		]);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, darwin: true, exec: keychain.exec },
		});

		expect(result).toMatchObject({ ok: true });
		expect(
			keychain.items.filter((item) => item.service === activeService),
		).toHaveLength(1);
		expect(
			JSON.parse(
				keychain.items.find((item) => item.service === activeService)?.secret ??
					"{}",
			).claudeAiOauth,
		).toEqual(oauth("t-b", 2_000));
	});

	it("refuses when the account attribute stays ambiguous", async () => {
		const f = fixture();
		rmSync(join(f.activeDir, ".credentials.json"));
		const activeService = keychainServicesForConfigDir(
			f.activeDir,
		)[0] as string;
		const keychain = fakeKeychain([
			{
				service: activeService,
				account: "legacy-account",
				secret: JSON.stringify({ claudeAiOauth: oauth("t-a-refreshed") }),
			},
		]);
		const exec = async (args: string[], stdin?: string) => {
			if (args.includes("-g")) throw new Error("attributes unavailable");
			return keychain.exec(args, stdin);
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, darwin: true, exec },
		});

		expect(result).toMatchObject({ ok: false, code: "keychain-ambiguous" });
		expect(keychain.calls.some((call) => call.args[0] === "-i")).toBe(false);
	});

	// The first auto-switch activation on a Mac: the active dir has never held
	// a login, so there is no item to update and none to copy a name from.
	it("creates the Keychain item on the first write into a fresh active dir", async () => {
		const f = fixture();
		const fresh = makeDir(join(f.superset, "accounts", "fresh-active"));
		const keychain = fakeKeychain([]);

		const result = await seedActiveClaudeLogin({
			source: asProfile(f.profileB),
			activeDir: fresh,
			deps: { ...f.deps, darwin: true, exec: keychain.exec },
		});

		expect(result).toMatchObject({ ok: true });
		expect(keychain.items).toHaveLength(1);
		expect(keychain.items[0]).toMatchObject({
			service: keychainServicesForConfigDir(fresh)[0] as string,
			account: claudeKeychainAccounts()[0] as string,
		});
		expect(JSON.parse(keychain.items[0]?.secret ?? "{}")).toEqual({
			claudeAiOauth: oauth("t-b", 2_000),
		});
		// The secret goes in on stdin, and no credential file is invented.
		expect(readdirSync(fresh)).not.toContain(".credentials.json");
		for (const call of keychain.calls) {
			expect(call.args.join(" ")).not.toContain("t-b");
		}
	});

	it("updates both stores when a file and a Keychain item hold a login", async () => {
		const f = fixture();
		const activeService = keychainServicesForConfigDir(
			f.activeDir,
		)[0] as string;
		const account = claudeKeychainAccounts()[0] as string;
		const keychain = fakeKeychain([
			{
				service: activeService,
				account,
				secret: JSON.stringify({
					claudeAiOauth: oauth("t-a-refreshed", 5_000),
				}),
			},
		]);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, darwin: true, exec: keychain.exec },
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
		expect(
			JSON.parse(
				keychain.items.find((item) => item.service === activeService)?.secret ??
					"{}",
			).claudeAiOauth,
		).toEqual(oauth("t-b", 2_000));
	});

	// Two stores, one write: a Keychain failure after the file landed leaves
	// the CLI free to serve either account, so the file goes back too.
	it("rolls the file back when the Keychain half of the write fails", async () => {
		const f = fixture();
		const activeService = keychainServicesForConfigDir(
			f.activeDir,
		)[0] as string;
		const account = claudeKeychainAccounts()[0] as string;
		const previous = JSON.stringify({
			claudeAiOauth: oauth("t-a-refreshed", 5_000),
		});
		const keychain = fakeKeychain([
			{ service: activeService, account, secret: previous },
		]);
		const exec = async (args: string[], stdin?: string) => {
			if (args[0] === "-i") {
				throw new Error(
					"SecKeychainItemModifyContent: write permissions error",
				);
			}
			return keychain.exec(args, stdin);
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, darwin: true, exec },
		});

		expect(result).toMatchObject({ ok: false, code: "write-failed" });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
		expect(
			keychain.items.find((item) => item.service === activeService)?.secret,
		).toBe(previous);
		expect(
			JSON.parse(readFileSync(join(f.activeDir, ".claude.json"), "utf-8"))
				.oauthAccount,
		).toEqual(identity("a").oauthAccount);
	});

	// The two stores can hold two different logins. Rolling one "freshest"
	// login into both signs whichever store it did not come from in as the
	// wrong account, which is the state the rollback exists to prevent.
	it("rolls each store back to its own pre-swap login", async () => {
		const f = fixture();
		const activeService = keychainServicesForConfigDir(
			f.activeDir,
		)[0] as string;
		const account = claudeKeychainAccounts()[0] as string;
		writeCredentials(f.activeDir, { claudeAiOauth: oauth("t-file", 5_000) });
		const keychain = fakeKeychain([
			{
				service: activeService,
				account,
				secret: JSON.stringify({ claudeAiOauth: oauth("t-keychain", 4_000) }),
			},
		]);
		// A directory in the state file's place fails the identity write.
		rmSync(join(f.activeDir, ".claude.json"));
		mkdirSync(join(f.activeDir, ".claude.json"));

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, darwin: true, exec: keychain.exec },
		});

		expect(result).toMatchObject({ ok: false, code: "write-failed" });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-file", 5_000),
		);
		expect(
			JSON.parse(
				keychain.items.find((item) => item.service === activeService)?.secret ??
					"{}",
			).claudeAiOauth,
		).toEqual(oauth("t-keychain", 4_000));
	});
});

describe("seedActiveClaudeLogin", () => {
	it("copies the source login and identity into a fresh active dir", async () => {
		const f = fixture();
		const empty = makeDir(join(f.superset, "accounts", "fresh-active"));
		writeCredentials(f.systemDefault, { claudeAiOauth: oauth("t-sys") });
		writeFileSync(
			join(f.home, ".claude.json"),
			JSON.stringify({ ...identity("sys"), hasCompletedOnboarding: true }),
		);

		const result = await seedActiveClaudeLogin({
			source: SYSTEM_DEFAULT,
			activeDir: empty,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(empty).claudeAiOauth).toEqual(oauth("t-sys"));
		expect(statSync(join(empty, ".credentials.json")).mode & 0o777).toBe(0o600);
		const state = JSON.parse(
			readFileSync(join(empty, ".claude.json"), "utf-8"),
		);
		expect(state.oauthAccount).toEqual(identity("sys").oauthAccount);
		// Seeding never writes back to the source.
		expect(readCredentials(f.systemDefault).claudeAiOauth).toEqual(
			oauth("t-sys"),
		);
	});
});
