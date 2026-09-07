import { afterEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
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

/** True once the swap's identity write has landed in this state file — the
 * signal a read of it is the verify step's, not the pre-write snapshot's. */
function namesB(statePath: string): boolean {
	return readFileSync(statePath, "utf-8").includes("uuid-b");
}

/** Deps whose read-back of the active identity finds a third account: a
 * `/login` landing between the identity write and the verify step. */
function identityStolenAtVerify(activeDir: string): ClaudeSwapDeps["fs"] {
	const state = join(activeDir, ".claude.json");
	return {
		readFile: async (path: string, encoding: "utf-8") => {
			const { readFile } = await import("node:fs/promises");
			if (path === state && namesB(state)) {
				writeFileSync(
					state,
					JSON.stringify({
						...JSON.parse(readFileSync(state, "utf-8")),
						...identity("c"),
					}),
				);
			}
			return readFile(path, encoding);
		},
	};
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
	// Writing goes through a rename, which needs only directory permission, so
	// a credential file that is present but unreadable would be replaced by a
	// store the swap never saw — measured before this guard: the owner came
	// back holding an OLDER login, its mcpOAuth siblings gone, no backup taken,
	// and ok:true returned.
	it("refuses to write over an owner store it could not read", async () => {
		if (process.getuid?.() === 0) return;
		const f = fixture();
		const ownerFile = join(f.profileA, ".credentials.json");
		chmodSync(ownerFile, 0o000);

		try {
			const result = await swapClaudeLogin({
				target: asProfile(f.profileB),
				ownerBinding: asProfile(f.profileA),
				activeDir: f.activeDir,
				deps: f.deps,
			});

			expect(result).toMatchObject({ ok: false, code: "invalid-owner" });
		} finally {
			chmodSync(ownerFile, 0o600);
		}
		// The store it could not read is exactly as it was.
		expect(readCredentials(f.profileA)).toEqual({
			claudeAiOauth: oauth("t-a", 1_000),
			mcpOAuth: { "a-server": { token: "m-a" } },
		});
	});

	it("refuses to write over an active store it could not read", async () => {
		if (process.getuid?.() === 0) return;
		const f = fixture();
		const activeFile = join(f.activeDir, ".credentials.json");
		chmodSync(activeFile, 0o000);

		try {
			const result = await swapClaudeLogin({
				target: asProfile(f.profileB),
				ownerBinding: asProfile(f.profileA),
				activeDir: f.activeDir,
				deps: f.deps,
			});

			expect(result).toMatchObject({ ok: false, code: "invalid-active-dir" });
		} finally {
			chmodSync(activeFile, 0o600);
		}
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
	});

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

	// The active-identity gate protects the save-back, and an unmanaged owner
	// has none — so an optional hint must not turn a swap that writes nothing
	// into a refusal. Measured before this: `owner-unknown`, with the owner
	// file byte-identical afterwards.
	it("swaps for an unmanaged owner whose active identity does not match", async () => {
		const f = fixture();
		writeFileSync(
			join(f.activeDir, ".claude.json"),
			JSON.stringify(identity("c")),
		);
		const before = readFileSync(join(f.profileA, ".credentials.json"), "utf-8");

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			ownerManaged: false,
			expectedOwnerAccountId: "uuid-a",
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
		// Nothing landed in the owner's store, backup included.
		expect(readFileSync(join(f.profileA, ".credentials.json"), "utf-8")).toBe(
			before,
		);
		expect(readdirSync(f.profileA).sort()).toEqual([
			".claude.json",
			".credentials.json",
		]);
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

	// AE13 again, one step earlier: a `.claude.json` the swap cannot read is a
	// snapshot the rollback could not put back, so the refusal is pre-flight.
	// Measured before it moved: the target's login landed in the live active
	// dir and only the rollback took it back out.
	it("refuses an unreadable identity before writing the credential", async () => {
		const f = fixture();
		// A directory in the state file's place fails every read and rename.
		rmSync(join(f.activeDir, ".claude.json"));
		mkdirSync(join(f.activeDir, ".claude.json"));
		const renamedTo: string[] = [];
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				rename: async (from: string, to: string) => {
					renamedTo.push(to);
					const { rename } = await import("node:fs/promises");
					await rename(from, to);
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
		// The pin: no write to undo. Every store write lands by rename, so the
		// live credential never being a rename target is the whole claim — the
		// content check below passes on the write-then-roll-back version too.
		expect(renamedTo).not.toContain(join(f.activeDir, ".credentials.json"));
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

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, fs: identityStolenAtVerify(f.activeDir) },
		});

		expect(result).toMatchObject({ ok: false, code: "verify-failed" });
		expect(readdirSync(f.activeDir)).not.toContain(".credentials.json");
	});

	it("reports split state when the rollback fails too", async () => {
		const f = fixture();
		const stolen = identityStolenAtVerify(f.activeDir) as {
			readFile: (path: string, encoding: "utf-8") => Promise<string>;
		};
		let credentialWrites = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				// The verify step finds a third account, so the swap rolls back.
				readFile: stolen.readFile,
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

	// The other end of the same staleness: the owner's own profile was
	// re-authenticated as C after discovery, so saving A's refreshed login into
	// it destroys C's login and leaves it labelled as C's.
	it("refuses the save-back when the owner store now holds another account", async () => {
		const f = fixture();
		writeCredentials(f.profileA, { claudeAiOauth: oauth("t-c", 3_000) });
		writeFileSync(
			join(f.profileA, ".claude.json"),
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
		// C's login stands, and the swap never reached the active dir.
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(
			oauth("t-c", 3_000),
		);
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	// The same broken binding, with the stray `/login` in the owner profile
	// left holding the newer expiry — which is the usual shape, since a fresh
	// login wins on at least one of the two timestamps `wouldRegress` ORs.
	// Measured before this gate was hoisted: ok:true, and A's only live
	// credential survived nowhere but a `.superset-swap-bak` copy.
	it("refuses the save-back when the owner store is another account's and looks newer", async () => {
		const f = fixture();
		writeCredentials(f.profileA, { claudeAiOauth: oauth("t-c", 9_000) });
		writeFileSync(
			join(f.profileA, ".claude.json"),
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
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(
			oauth("t-c", 9_000),
		);
		// A's login is still live in the active dir, not only in a backup.
		expect(readCredentials(f.activeDir)).toEqual(before);
		expect(readdirSync(f.activeDir).sort()).toEqual([
			".claude.json",
			".credentials.json",
		]);
	});

	// Reads, two validateDir calls and — on darwin — a Keychain probe sit
	// between the read of the active login and the owner write, and a session
	// refreshing in that window rotates the refresh token. Saving the value
	// read before it loses that token.
	it("saves the login the active dir holds when the owner write runs", async () => {
		const f = fixture();
		let refreshed = false;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					// The CLI refreshes the active login while the owner store is read.
					if (path === join(f.profileA, ".credentials.json") && !refreshed) {
						refreshed = true;
						writeCredentials(f.activeDir, {
							claudeAiOauth: oauth("t-a-rotated", 7_000),
							mcpOAuth: { "active-server": { token: "m-active" } },
						});
					}
					return readFile(path, encoding);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			expectedOwnerAccountId: "uuid-a",
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: true });
		expect(refreshed).toBe(true);
		const owner = readCredentials(f.profileA);
		expect(owner.claudeAiOauth).toEqual(oauth("t-a-rotated", 7_000));
		expect(owner.mcpOAuth).toEqual({ "a-server": { token: "m-a" } });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
	});

	/** Deps that refresh the owner's own store once, while the swap re-reads
	 * the active login — the window between the owner read and the write. */
	function ownerRefreshedMidWrite(f: Fixture): {
		deps: ClaudeSwapDeps;
		refreshed: () => boolean;
	} {
		const activeFile = join(f.activeDir, ".credentials.json");
		let activeReads = 0;
		let done = false;
		return {
			refreshed: () => done,
			deps: {
				...f.deps,
				fs: {
					readFile: async (path: string, encoding: "utf-8") => {
						const { readFile } = await import("node:fs/promises");
						// The second read of the active login is the save-back's
						// payload re-read: a session against the owner's own dir
						// refreshes it there in the same moment.
						if (path === activeFile && ++activeReads === 2) {
							done = true;
							writeCredentials(f.profileA, {
								claudeAiOauth: oauth("t-a-newer", 9_000),
								mcpOAuth: { "a-server": { token: "m-a-rotated" } },
							});
						}
						return readFile(path, encoding);
					},
				},
			},
		};
	}

	// The destination half of the same staleness, and the one that loses data:
	// judged on the snapshot read before that refresh, the save-back overwrites
	// the owner's newer token, rolls its mcpOAuth back, and keeps a backup of
	// bytes it never overwrote. Same account throughout, so no identity gate
	// can see it.
	it("does not overwrite an owner login refreshed while the swap read on", async () => {
		const f = fixture();
		const { deps, refreshed } = ownerRefreshedMidWrite(f);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			expectedOwnerAccountId: "uuid-a",
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: true });
		expect(refreshed()).toBe(true);
		const owner = readCredentials(f.profileA);
		// The newer login stands and its siblings are not rolled back...
		expect(owner.claudeAiOauth).toEqual(oauth("t-a-newer", 9_000));
		expect(owner.mcpOAuth).toEqual({ "a-server": { token: "m-a-rotated" } });
		// ...and no backup of the bytes nothing overwrote is left behind.
		expect(readdirSync(f.profileA).sort()).toEqual([
			".claude.json",
			".credentials.json",
		]);
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
	});

	// The same re-read fails closed for the same reason the first one does:
	// the write is a rename, so a store that went unreadable in between would
	// be replaced by one this swap never saw.
	it("refuses when the owner store stops being readable before the write", async () => {
		const f = fixture();
		const ownerFile = join(f.profileA, ".credentials.json");
		let ownerReads = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					if (path === ownerFile && ++ownerReads > 1) {
						const denied = new Error(
							`EACCES: permission denied, open '${path}'`,
						) as NodeJS.ErrnoException;
						denied.code = "EACCES";
						throw denied;
					}
					return readFile(path, encoding);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			expectedOwnerAccountId: "uuid-a",
			activeDir: f.activeDir,
			deps,
		});

		expect(result).toMatchObject({ ok: false, code: "invalid-owner" });
		expect(readCredentials(f.profileA)).toEqual({
			claudeAiOauth: oauth("t-a", 1_000),
			mcpOAuth: { "a-server": { token: "m-a" } },
		});
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
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
					// Once the state file names the target, the identity write has
					// landed and the read under way is the verify step's.
					if (path === join(f.activeDir, ".claude.json") && namesB(path)) {
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

	// The rollback runs after the identity block was written, so putting only
	// the credential back would leave `.claude.json` naming the target: the
	// previous login filed under the target's account, which is what a later
	// ownership check and save-back read.
	it("restores the previous identity when the verify step fails", async () => {
		const f = fixture();
		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, fs: identityStolenAtVerify(f.activeDir) },
		});

		expect(result).toMatchObject({ ok: false, code: "verify-failed" });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
		const state = JSON.parse(
			readFileSync(join(f.activeDir, ".claude.json"), "utf-8"),
		);
		expect(state.oauthAccount).toEqual(identity("a").oauthAccount);
		expect(state.userID).toBe("user-a");
		expect(state.projects["/tmp/session"].hasTrustDialogAccepted).toBe(true);
	});

	it("removes the identity keys on rollback when the dir had none", async () => {
		const f = fixture();
		writeFileSync(
			join(f.activeDir, ".claude.json"),
			JSON.stringify({
				projects: { "/tmp/session": { hasTrustDialogAccepted: true } },
			}),
		);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: { ...f.deps, fs: identityStolenAtVerify(f.activeDir) },
		});

		expect(result).toMatchObject({ ok: false, code: "verify-failed" });
		const state = JSON.parse(
			readFileSync(join(f.activeDir, ".claude.json"), "utf-8"),
		);
		expect(state.oauthAccount).toBeUndefined();
		expect(state.userID).toBeUndefined();
		expect(state.projects["/tmp/session"].hasTrustDialogAccepted).toBe(true);
	});

	// A read of `.claude.json` that fails transiently — EIO, or one that lost
	// the race with the CLI's own atomic rewrite — is not a dir holding no
	// identity. Measured before this guard: the swap wrote the target's identity
	// over a snapshot it never took, and the verify-failed rollback then deleted
	// `oauthAccount`/`userID` and put nothing back, leaving a credential with no
	// identity that every later swap refuses as `owner-unknown` until a human
	// runs `/login`.
	it("keeps the dir's own identity when the pre-write read of it fails", async () => {
		const f = fixture();
		const state = join(f.activeDir, ".claude.json");
		const stolen = identityStolenAtVerify(f.activeDir) as {
			readFile: (path: string, encoding: "utf-8") => Promise<string>;
		};
		let reads = 0;
		const renamedTo: string[] = [];
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					// Only the snapshot read the rollback depends on. Every read after
					// it succeeds, so the unguarded code got as far as writing the
					// identity and then rolled it back to nothing.
					if (path === state && ++reads === 1) {
						throw Object.assign(new Error("EIO: i/o error, read"), {
							code: "EIO",
						});
					}
					return stolen.readFile(path, encoding);
				},
				rename: async (from: string, to: string) => {
					renamedTo.push(to);
					const { rename } = await import("node:fs/promises");
					await rename(from, to);
				},
			},
		};

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps,
		});

		expect(result.ok).toBe(false);
		// The refusal is pre-flight, so the target's login never reached the
		// live credential — nothing was written for a rollback to undo.
		expect(renamedTo).not.toContain(join(f.activeDir, ".credentials.json"));
		// The pin: the dir still names the account it was signed in as.
		const stateFile = JSON.parse(readFileSync(state, "utf-8"));
		expect(stateFile.oauthAccount).toEqual(identity("a").oauthAccount);
		expect(stateFile.userID).toBe("user-a");
		expect(stateFile.projects["/tmp/session"].hasTrustDialogAccepted).toBe(
			true,
		);
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
	});

	// The snapshot the rollback puts back has to be taken before the credential
	// write: a session running against the active dir picks the target's
	// credential up the moment it lands and rewrites `.claude.json` with the
	// target's identity, so a snapshot read after the write is the target's,
	// not the dir's own. Measured before the fix: verify failed, the rollback
	// put A's credential back under B's name, and every later swap refused that
	// dir as `owner-unknown` until a human ran `/login`.
	it("snapshots the dir's own identity before the credential write", async () => {
		const f = fixture();
		const state = join(f.activeDir, ".claude.json");
		const rewrite = (block: Record<string, unknown>): void => {
			writeFileSync(
				state,
				JSON.stringify({
					...JSON.parse(readFileSync(state, "utf-8")),
					...block,
				}),
			);
		};
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					if (path === state) {
						const live = readCredentials(f.activeDir).claudeAiOauth as {
							accessToken?: string;
						};
						if (live.accessToken === "t-b" && !namesB(state)) {
							// The session's own rewrite: it can only name B once B's
							// credential is on disk, so a snapshot taken before the write
							// never sees it.
							rewrite(identity("b"));
						} else if (namesB(state)) {
							// A `/login` after the identity write, so the verify step fails
							// and the rollback is what the dir is left holding.
							rewrite(identity("c"));
						}
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
		// The pin: the owner's credential under the owner's own name, not B's.
		const stateFile = JSON.parse(readFileSync(state, "utf-8"));
		expect(stateFile.oauthAccount).toEqual(identity("a").oauthAccount);
		expect(stateFile.userID).toBe("user-a");
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
	// `/home` is a symlink on ostree hosts and $SUPERSET_HOME_DIR can name a
	// symlinked volume: the candidate is realpath'd, so a base left unresolved
	// put every dir "outside the home and Superset home dirs" and no swap or
	// seed could ever run.
	it("accepts dirs under a home and Superset home spelled through symlinks", async () => {
		const f = fixture();
		const links = tempRoot("swap-links");
		const homeLink = join(links, "home");
		const supersetLink = join(links, "superset");
		symlinkSync(f.home, homeLink);
		symlinkSync(f.superset, supersetLink);

		const result = await swapClaudeLogin({
			target: asProfile(join(homeLink, ".claude-b")),
			ownerBinding: asProfile(join(homeLink, ".claude-a")),
			activeDir: join(supersetLink, "accounts", "claude-active"),
			deps: {
				...f.deps,
				homeDir: homeLink,
				supersetHomeDir: supersetLink,
			},
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
	});

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

	// `readIdentity` collapses EACCES, EIO and a torn `.claude.json` into "no
	// identity", and nothing downstream re-checks: the verify step compares the
	// read-back against the keys the swap itself just wrote, so it always
	// matches. Measured before this guard: a target `/login`-ing to C mid-swap
	// with its identity unreadable returned ok:true with C's token installed
	// under B's name.
	it("aborts when the target's identity cannot be re-read mid-swap", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);
		const targetState = join(f.profileB, ".claude.json");
		let identityReads = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					// The first read is loadTarget's; the mid-swap re-read is denied.
					if (path === targetState && identityReads++ >= 1) {
						throw Object.assign(new Error("EACCES: permission denied"), {
							code: "EACCES",
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

		expect(result).toMatchObject({ ok: false, code: "target-changed" });
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	// Accounts the CLI recorded without an accountUuid still have to be told
	// apart: the uuid pair is the preferred comparison, the email is the one
	// that is there.
	it("aborts when the target's identity changes email with no uuid to compare", async () => {
		const f = fixture();
		const before = readCredentials(f.activeDir);
		const emailOnly = (name: string) => ({
			oauthAccount: { emailAddress: `${name}@example.com` },
		});
		writeFileSync(
			join(f.profileB, ".claude.json"),
			JSON.stringify(emailOnly("b")),
		);
		let reads = 0;
		const deps: ClaudeSwapDeps = {
			...f.deps,
			fs: {
				readFile: async (path: string, encoding: "utf-8") => {
					const { readFile } = await import("node:fs/promises");
					if (path === join(f.profileB, ".credentials.json") && reads++ === 1) {
						writeFileSync(
							join(f.profileB, ".claude.json"),
							JSON.stringify(emailOnly("c")),
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

	it("refuses when the login's own half of the default slot is group-writable", async () => {
		const f = fixture();
		// The CLI keeps this login in `~/.config/claude`, the other half of the
		// one default slot, so that — not `~/.claude` — is where a save-back
		// and its backups land.
		const configDir = makeDir(join(f.home, ".config", "claude"));
		const configCredentials = join(configDir, "credentials.json");
		writeFileSync(
			configCredentials,
			JSON.stringify({ claudeAiOauth: oauth("t-sys", 1_000) }),
			{ mode: 0o600 },
		);
		writeFileSync(
			join(f.home, ".claude.json"),
			JSON.stringify(identity("sys")),
		);
		writeCredentials(f.activeDir, {
			claudeAiOauth: oauth("t-sys-refreshed", 5_000),
		});
		writeFileSync(
			join(f.activeDir, ".claude.json"),
			JSON.stringify(identity("sys")),
		);
		chmodSync(configDir, 0o770);
		const before = readCredentials(f.activeDir);

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: SYSTEM_DEFAULT,
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "invalid-owner" });
		expect(
			JSON.parse(readFileSync(configCredentials, "utf-8")).claudeAiOauth,
		).toEqual(oauth("t-sys", 1_000));
		// No credential, no tmp file and no backup landed in the unsafe dir.
		expect(readdirSync(configDir)).toEqual(["credentials.json"]);
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	// The mirror of the owner case above: the same 0770 dir was refused as an
	// owner store and read from as a target, so one directory was at once too
	// unsafe to write and safe enough to take a login out of. Measured before
	// this guard: ok:true with the planted token installed.
	it("refuses a target whose half of the default slot is group-writable", async () => {
		const f = fixture();
		const configDir = makeDir(join(f.home, ".config", "claude"));
		writeFileSync(
			join(configDir, "credentials.json"),
			JSON.stringify({ claudeAiOauth: oauth("t-planted", 9_000) }),
			{ mode: 0o600 },
		);
		writeFileSync(
			join(f.home, ".claude.json"),
			JSON.stringify(identity("sys")),
		);
		chmodSync(configDir, 0o770);
		const before = readCredentials(f.activeDir);

		const result = await swapClaudeLogin({
			target: SYSTEM_DEFAULT,
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: false, code: "invalid-target" });
		expect(readCredentials(f.activeDir)).toEqual(before);
	});

	// `~/.claude` is not where the login has to live, so its absence is not a
	// reason to refuse the dir the login was actually read from.
	it("swaps in a default login that lives only in ~/.config/claude", async () => {
		const f = fixture();
		rmSync(f.systemDefault, { recursive: true, force: true });
		const configDir = makeDir(join(f.home, ".config", "claude"));
		writeFileSync(
			join(configDir, "credentials.json"),
			JSON.stringify({ claudeAiOauth: oauth("t-sys", 1_000) }),
			{ mode: 0o600 },
		);
		writeFileSync(
			join(f.home, ".claude.json"),
			JSON.stringify(identity("sys")),
		);

		const result = await swapClaudeLogin({
			target: SYSTEM_DEFAULT,
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error(result.reason);
		expect(result.identity.accountUuid).toBe("uuid-sys");
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-sys", 1_000),
		);
	});

	// The owner gate belongs to the save-back: with no login in the active dir
	// there is nothing to save, so a missing `~/.claude` is not in the way.
	it("does not judge the owner dir when there is no login to save back", async () => {
		const f = fixture();
		rmSync(f.systemDefault, { recursive: true, force: true });
		rmSync(join(f.activeDir, ".credentials.json"));

		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: SYSTEM_DEFAULT,
			activeDir: f.activeDir,
			deps: f.deps,
		});

		expect(result).toMatchObject({ ok: true });
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-b", 2_000),
		);
		expect(existsSync(f.systemDefault)).toBe(false);
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

	// A CLI run without USER leaves an item holding only MCP tokens, filed
	// under a name the active dir's own probes never guess. It is still the
	// item the read located and the item whose siblings the write merges, so
	// the login has to land in it — addressing a freshly computed name instead
	// puts the mcpOAuth of one item into a second one the CLI never reads.
	it("writes into the item the read found even when it holds no login", async () => {
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
					mcpOAuth: { "active-server": { token: "m-active" } },
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
		expect(keychain.items).toHaveLength(1);
		expect(keychain.items[0]).toMatchObject({
			service: activeService,
			account: "legacy-account",
		});
		expect(JSON.parse(keychain.items[0]?.secret ?? "{}")).toEqual({
			mcpOAuth: { "active-server": { token: "m-active" } },
			claudeAiOauth: oauth("t-b", 2_000),
		});
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
		const result = await swapClaudeLogin({
			target: asProfile(f.profileB),
			ownerBinding: asProfile(f.profileA),
			activeDir: f.activeDir,
			deps: {
				...f.deps,
				darwin: true,
				exec: keychain.exec,
				// A third account landing at the verify step is what rolls both
				// stores back, with each one's own pre-swap login to put back.
				fs: identityStolenAtVerify(f.activeDir),
			},
		});

		expect(result).toMatchObject({ ok: false, code: "verify-failed" });
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

	// The owner's dir has the same two stores, and `applyStoreWrite` lands the
	// file first. Measured before the save-back had a rollback: the caller was
	// told `write-failed` — which reads as "nothing landed" — while the owner's
	// file held the rotated login and its Keychain item still held the
	// pre-rotation one, leaving the CLI free to serve either.
	it("rolls the owner file back when the Keychain half of the save-back fails", async () => {
		const f = fixture();
		const ownerService = keychainServicesForConfigDir(f.profileA)[0] as string;
		const account = claudeKeychainAccounts()[0] as string;
		const ownerSecret = JSON.stringify({ claudeAiOauth: oauth("t-a", 1_000) });
		const keychain = fakeKeychain([
			{ service: ownerService, account, secret: ownerSecret },
		]);
		const exec = async (args: string[], stdin?: string) => {
			// The save-back's own write, named by the login it carries: the active
			// dir's is written later and carries the target's.
			if (args[0] === "-i" && stdin?.includes("t-a-refreshed")) {
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
		const ownerItem = keychain.items.find(
			(item) => item.service === ownerService,
		);
		// Each of the owner's two stores holds the login it held before, siblings
		// included...
		expect(readCredentials(f.profileA)).toEqual({
			claudeAiOauth: oauth("t-a", 1_000),
			mcpOAuth: { "a-server": { token: "m-a" } },
		});
		expect(ownerItem?.secret).toBe(ownerSecret);
		// ...so the two agree, which is the point: one store rotated and the
		// other not is the split `write-failed` tells the caller did not happen.
		expect(readCredentials(f.profileA).claudeAiOauth).toEqual(
			JSON.parse(ownerItem?.secret ?? "{}").claudeAiOauth,
		);
		// And the swap stopped before the active dir, as the code says.
		expect(readCredentials(f.activeDir).claudeAiOauth).toEqual(
			oauth("t-a-refreshed", 5_000),
		);
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
