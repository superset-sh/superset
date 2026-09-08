import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { quotaEntryKey } from "../../../account-engine/quota-store.ts";
import type { HostDb } from "../../../db/index.ts";
import type { HostServiceContext } from "../../../types.ts";
import type { UsageAccount } from "./types.ts";
import { usageRouter } from "./usage.ts";

// Paths under the real home (Bun's os.homedir() ignores $HOME, and
// profile-remove.ts refuses anything outside it) that are never created: the
// removal itself is `rm --force`, so a missing dir keeps this test hermetic.
const ACTIVE_DIR = join(homedir(), ".claude-usage-router-test-active");
const SPARE_DIR = join(homedir(), ".claude-usage-router-test-spare");

function account(overrides: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "key",
		sourceLabel: "~/.claude",
		email: null,
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		accountId: null,
		inRotation: true,
		managed: true,
		isDefault: false,
		fetchedAt: new Date(0),
		...overrides,
	};
}

/**
 * R25: the active account is what every running session is signed in as, so
 * its dir can only be deleted after another account has become active.
 */
describe("usageRouter.removeAccount", () => {
	let home: string;
	let previousHome: string | undefined;
	const invalidate = mock((_key: string) => {});

	function context(): HostServiceContext {
		return {
			isAuthenticated: true,
			db: {
				select: () => ({
					from: () => ({
						get: () => ({
							defaultClaudeConfigDir: null,
							defaultCodexHome: null,
						}),
					}),
				}),
				insert: () => ({
					values: () => ({ onConflictDoUpdate: () => ({ run: () => {} }) }),
				}),
			} as unknown as HostDb,
			runtime: {
				quotaStore: {
					read: async () => [
						account({ accountId: "uuid-a", selection: ACTIVE_DIR }),
						account({ accountId: "uuid-b", selection: SPARE_DIR }),
					],
					invalidate,
				},
			},
		} as unknown as HostServiceContext;
	}

	/** What the engine records after a switch; rewriting it mid-call is a
	 * switch landing while this mutation is in flight. */
	function writeRuntime(accountId: string, selection: string): void {
		const stateDir = join(home, "state", "account-engine");
		mkdirSync(stateDir, { recursive: true, mode: 0o700 });
		writeFileSync(
			join(stateDir, "runtime.json"),
			JSON.stringify({
				version: 1,
				perAgent: {
					claude: {
						cooldownUntil: null,
						exhaustedNotifiedAt: null,
						fallbackTimestamps: [],
						activeAccountId: accountId,
						activeSelection: selection,
					},
					codex: {
						cooldownUntil: null,
						exhaustedNotifiedAt: null,
						fallbackTimestamps: [],
						activeAccountId: null,
						activeSelection: null,
					},
				},
				identityBindings: {},
			}),
			{ mode: 0o600 },
		);
	}

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-remove-account-"));
		process.env.SUPERSET_HOME_DIR = home;
		writeRuntime("uuid-a", ACTIVE_DIR);
		invalidate.mockClear();
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("refuses the active account and says to switch first", async () => {
		await expect(
			usageRouter
				.createCaller(context())
				.removeAccount({ agent: "claude", selection: ACTIVE_DIR }),
		).rejects.toThrow(/switch/i);
		expect(invalidate).not.toHaveBeenCalled();
	});

	// A row can own several dirs, and removal names one of them. Testing only
	// the row's surviving selection let the live dir go: the identity branches
	// catch it only once the engine has recorded an activeAccountId, which it
	// never has on Windows, in a sandbox, or after a pointer migrated from the
	// pre-engine setting — and deletion is rm -rf plus the keychain items.
	it("refuses a duplicate dir that the pointer names", async () => {
		// No engine record, as on a host that has never switched — so only the
		// pointer says which dir is live.
		writeRuntime(null as unknown as string, null as unknown as string);
		const ctx = {
			...context(),
			db: {
				select: () => ({
					from: () => ({
						get: () => ({
							defaultClaudeConfigDir: ACTIVE_DIR,
							defaultCodexHome: null,
						}),
					}),
				}),
				insert: () => ({
					values: () => ({ onConflictDoUpdate: () => ({ run: () => {} }) }),
				}),
			} as unknown as HostDb,
			runtime: {
				quotaStore: {
					read: async () => [
						account({
							accountId: "uuid-a",
							selection: SPARE_DIR,
							duplicateSelections: [ACTIVE_DIR],
						}),
					],
					invalidate,
				},
			},
		} as unknown as HostServiceContext;

		await expect(
			usageRouter
				.createCaller(ctx)
				.removeAccount({ agent: "claude", selection: ACTIVE_DIR }),
		).rejects.toThrow(/switch/i);
		expect(invalidate).not.toHaveBeenCalled();
	});

	it("removes an account that is not active and drops its store entry", async () => {
		await usageRouter
			.createCaller(context())
			.removeAccount({ agent: "claude", selection: SPARE_DIR });

		expect(invalidate).toHaveBeenCalledWith(quotaEntryKey("claude", SPARE_DIR));
	});

	// A switch landing after the first check would otherwise delete the dir
	// every running session is signed in to.
	it("refuses an account that became active before the delete", async () => {
		const ctx = context();
		let reads = 0;
		(
			ctx.runtime.quotaStore as unknown as {
				read: () => Promise<UsageAccount[]>;
			}
		).read = async () => {
			// The engine finishes a switch onto the spare account between the
			// first check and the last one.
			if (++reads === 2) writeRuntime("uuid-b", SPARE_DIR);
			return [
				account({ accountId: "uuid-a", selection: ACTIVE_DIR }),
				account({ accountId: "uuid-b", selection: SPARE_DIR }),
			];
		};

		await expect(
			usageRouter
				.createCaller(ctx)
				.removeAccount({ agent: "claude", selection: SPARE_DIR }),
		).rejects.toThrow(/switch/i);
		expect(invalidate).not.toHaveBeenCalled();
	});

	// The re-check is only worth anything if a switch cannot run between it
	// and the delete: the removal joins the engine's mutation lane, so a
	// switch already queued there lands first and the re-check sees it.
	it("runs the re-check behind a switch already queued on the engine", async () => {
		const ctx = context();
		let lane: Promise<unknown> = Promise.resolve();
		const runExclusive = <T>(fn: () => Promise<T>): Promise<T> => {
			const next = lane.then(fn, fn);
			lane = next.then(
				() => {},
				() => {},
			);
			return next;
		};
		const agentStatus = { activeAccountId: null, activeSelection: null };
		(ctx.runtime as unknown as { accountEngine: unknown }).accountEngine = {
			status: () => ({ claude: agentStatus, codex: agentStatus }),
			ownsLock: () => true,
			runExclusive,
		};

		// A switch onto the spare account is mid-flight on the lane when the
		// removal arrives, and finishes after the removal's first check.
		void runExclusive(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			writeRuntime("uuid-b", SPARE_DIR);
		});

		await expect(
			usageRouter
				.createCaller(ctx)
				.removeAccount({ agent: "claude", selection: SPARE_DIR }),
		).rejects.toThrow(/switch/i);
		expect(invalidate).not.toHaveBeenCalled();
	});

	// KTD5: the lane above serialises this host-service only, so on a lock
	// loser the owner can still switch onto the dir this call is deleting.
	it("refuses removal on a host-service that does not own the lock", async () => {
		const ctx = context();
		const agentStatus = { activeAccountId: null, activeSelection: null };
		(ctx.runtime as unknown as { accountEngine: unknown }).accountEngine = {
			status: () => ({ claude: agentStatus, codex: agentStatus }),
			ownsLock: () => false,
			runExclusive: <T>(fn: () => Promise<T>) => fn(),
		};

		await expect(
			usageRouter
				.createCaller(ctx)
				.removeAccount({ agent: "claude", selection: SPARE_DIR }),
		).rejects.toThrow("lock-loser");
		expect(invalidate).not.toHaveBeenCalled();
	});

	// The lock can be lost while the removal waits on the lane, and the owner
	// that took it swaps onto the dir before it persists the runtime this
	// call reads — so the active-account re-check above cannot see the switch.
	// Only re-reading the lock immediately before the rm catches it.
	function lockContext(profile: string, ownsLock: () => boolean) {
		const ctx = context();
		const agentStatus = { activeAccountId: null, activeSelection: null };
		(ctx.runtime as unknown as { accountEngine: unknown }).accountEngine = {
			status: () => ({ claude: agentStatus, codex: agentStatus }),
			ownsLock,
			runExclusive: <T>(fn: () => Promise<T>) => fn(),
		};
		(
			ctx.runtime.quotaStore as unknown as {
				read: () => Promise<UsageAccount[]>;
			}
		).read = async () => [
			account({ accountId: "uuid-a", selection: ACTIVE_DIR }),
			account({ accountId: "uuid-b", selection: profile }),
		];
		return ctx;
	}

	it("refuses a removal whose lock is lost while it waits on the lane", async () => {
		// Under the home dir so the removal guards accept it; a real dir so
		// the assertion is that it survived, not that it never existed.
		const profile = mkdtempSync(join(homedir(), ".claude-usage-router-lock-"));
		try {
			let owns = true;
			const ctx = lockContext(profile, () => owns);
			// The owner takes the lock while this removal sits on the lane.
			(
				ctx.runtime as unknown as {
					accountEngine: {
						runExclusive: <T>(fn: () => Promise<T>) => Promise<T>;
					};
				}
			).accountEngine.runExclusive = async (fn) => {
				owns = false;
				return await fn();
			};

			await expect(
				usageRouter
					.createCaller(ctx)
					.removeAccount({ agent: "claude", selection: profile }),
			).rejects.toThrow("lock-loser");
			expect(existsSync(profile)).toBe(true);
			expect(invalidate).not.toHaveBeenCalled();
		} finally {
			rmSync(profile, { recursive: true, force: true });
		}
	});

	it("removes the profile when the lock is still held at the delete", async () => {
		const profile = mkdtempSync(join(homedir(), ".claude-usage-router-lock-"));
		try {
			await usageRouter
				.createCaller(lockContext(profile, () => true))
				.removeAccount({ agent: "claude", selection: profile });

			expect(existsSync(profile)).toBe(false);
			expect(invalidate).toHaveBeenCalledWith(quotaEntryKey("claude", profile));
		} finally {
			rmSync(profile, { recursive: true, force: true });
		}
	});

	// An engine that cannot use its state dir claims no lock, so `ownsLock()`
	// is false with nothing whatsoever holding the lock — and every engine
	// sharing that dir is in the same position, so none can switch onto this
	// profile. Refusing here left the profile undeletable for good.
	it("removes the profile when the engine state dir is unusable", async () => {
		const profile = mkdtempSync(join(homedir(), ".claude-usage-router-perm-"));
		try {
			chmodSync(join(home, "state", "account-engine"), 0o777);

			await usageRouter
				.createCaller(lockContext(profile, () => false))
				.removeAccount({ agent: "claude", selection: profile });

			expect(existsSync(profile)).toBe(false);
			expect(invalidate).toHaveBeenCalledWith(quotaEntryKey("claude", profile));
		} finally {
			rmSync(profile, { recursive: true, force: true });
		}
	});

	// KTD2/KTD4: from the first swap onwards the pointer names Superset's own
	// active dir, and only the engine's runtime record says which login was
	// swapped into it. Without that record nothing above can name the live
	// account — so the dir's own identity is asked instead.
	function pointAtActiveDir(): void {
		mkdirSync(join(home, "state"), { recursive: true });
		writeFileSync(
			join(home, "state", "default-claude-config-dir"),
			join(home, "accounts", "claude-active"),
		);
	}

	/** The login sitting in the active dir; null writes the dir with no
	 * identity in it, which is a host that cannot say who is live. */
	function writeActiveIdentity(accountId: string | null): void {
		const activeDir = join(home, "accounts", "claude-active");
		mkdirSync(activeDir, { recursive: true });
		if (accountId === null) return;
		writeFileSync(
			join(activeDir, ".claude.json"),
			JSON.stringify({
				oauthAccount: { accountUuid: accountId, emailAddress: "a@example.com" },
			}),
		);
	}

	/** No runtime record: the engine never ran, its file was lost, or its
	 * state dir is unusable and every write no-ops. */
	function dropRuntime(): void {
		rmSync(join(home, "state", "account-engine", "runtime.json"), {
			force: true,
		});
	}

	it("refuses the profile whose login the active dir holds when no runtime record names it", async () => {
		const profile = mkdtempSync(
			join(homedir(), ".claude-usage-router-unknown-"),
		);
		try {
			pointAtActiveDir();
			dropRuntime();
			// uuid-b is the account `lockContext` puts at `profile`, so the dir
			// being deleted is the source of the login every session is on.
			writeActiveIdentity("uuid-b");

			await expect(
				usageRouter
					.createCaller(lockContext(profile, () => true))
					.removeAccount({ agent: "claude", selection: profile }),
			).rejects.toThrow(/switch/i);
			expect(existsSync(profile)).toBe(true);
			expect(invalidate).not.toHaveBeenCalled();
		} finally {
			rmSync(profile, { recursive: true, force: true });
		}
	});

	// The state dir is where the runtime record lives, so on a host with an
	// unusable one the answer above is unknown forever — and no switch is
	// available there either. Refusing on `unknown` alone would leave every
	// profile permanently undeletable; the active dir's identity is read
	// outside that dir, so it still names the live account.
	it("still removes a non-active profile when the state dir is unusable and no runtime record exists", async () => {
		const profile = mkdtempSync(
			join(homedir(), ".claude-usage-router-unknown-perm-"),
		);
		try {
			pointAtActiveDir();
			dropRuntime();
			// The live login is the other account, so this profile is free.
			writeActiveIdentity("uuid-a");
			chmodSync(join(home, "state", "account-engine"), 0o777);

			await usageRouter
				.createCaller(lockContext(profile, () => false))
				.removeAccount({ agent: "claude", selection: profile });

			expect(existsSync(profile)).toBe(false);
			expect(invalidate).toHaveBeenCalledWith(quotaEntryKey("claude", profile));
		} finally {
			rmSync(profile, { recursive: true, force: true });
		}
	});

	it("refuses with its own code when the active dir cannot say who is live either", async () => {
		const profile = mkdtempSync(join(homedir(), ".claude-usage-router-blind-"));
		try {
			pointAtActiveDir();
			dropRuntime();
			writeActiveIdentity(null);

			await expect(
				usageRouter
					.createCaller(lockContext(profile, () => true))
					.removeAccount({ agent: "claude", selection: profile }),
			).rejects.toThrow("active-account-unknown");
			expect(existsSync(profile)).toBe(true);
			expect(invalidate).not.toHaveBeenCalled();
		} finally {
			rmSync(profile, { recursive: true, force: true });
		}
	});

	// The refusal above must not be a dead end: a user who has been told
	// Superset cannot tell which login is live can still remove the profile.
	it("removes a profile the caller acknowledged the unknown active account for", async () => {
		const profile = mkdtempSync(
			join(homedir(), ".claude-usage-router-blind-ack-"),
		);
		try {
			pointAtActiveDir();
			dropRuntime();
			writeActiveIdentity(null);

			await usageRouter
				.createCaller(lockContext(profile, () => true))
				.removeAccount({
					agent: "claude",
					selection: profile,
					acknowledgeUnknownActive: true,
				});

			expect(existsSync(profile)).toBe(false);
			expect(invalidate).toHaveBeenCalledWith(quotaEntryKey("claude", profile));
		} finally {
			rmSync(profile, { recursive: true, force: true });
		}
	});
});

/**
 * KTD13: the engine's hot swap is POSIX-only, but picking the login new
 * sessions launch on is not — that is a pointer write, and it worked on
 * Windows long before the engine existed.
 */
describe("usageRouter.setDefaultAccount", () => {
	let home: string;
	let previousHome: string | undefined;

	function context(options: { platformSupported: boolean }) {
		const switched: Array<{ agent: string; selection: string | null }> = [];
		const written: Array<Record<string, unknown>> = [];
		const agentStatus = {
			lockOwner: true,
			platformSupported: options.platformSupported,
		};
		const status = () => ({ claude: agentStatus, codex: agentStatus });
		const ctx = {
			isAuthenticated: true,
			db: {
				select: () => ({
					from: () => ({
						get: () => ({
							defaultClaudeConfigDir: null,
							defaultCodexHome: null,
						}),
					}),
				}),
				insert: () => ({
					values: (values: Record<string, unknown>) => {
						written.push(values);
						return { onConflictDoUpdate: () => ({ run: () => {} }) };
					},
				}),
			} as unknown as HostDb,
			runtime: {
				accountEngine: {
					status,
					ownsLock: () => true,
					switchManually: async (agent: string, selection: string | null) => {
						switched.push({ agent, selection });
						return { ok: true as const };
					},
				},
				quotaStore: {
					read: async () => [account({ accountId: "uuid-a", selection: null })],
				},
			},
		} as unknown as HostServiceContext;
		return { ctx, switched, written };
	}

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-set-default-account-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("writes the pointer itself where the engine cannot swap (Windows)", async () => {
		const { ctx, switched, written } = context({ platformSupported: false });

		await usageRouter
			.createCaller(ctx)
			.setDefaultAccount({ agent: "claude", selection: null });

		expect(switched).toEqual([]);
		expect(written).toEqual([{ id: 1, defaultClaudeConfigDir: null }]);
		expect(
			readFileSync(join(home, "state", "default-claude-config-dir"), "utf8"),
		).toBe("");
	});

	it("still refuses a login this host cannot see", async () => {
		const { ctx, switched } = context({ platformSupported: false });

		await expect(
			usageRouter
				.createCaller(ctx)
				.setDefaultAccount({ agent: "claude", selection: SPARE_DIR }),
		).rejects.toThrow(/refresh usage and pick again/);
		expect(switched).toEqual([]);
	});

	// Same host, opposite endpoint: the swap of running sessions is gone, but
	// which login new sessions launch on is a pointer write that needs no
	// state dir, so it takes the branch Windows already takes.
	it("writes the pointer itself when the engine state dir is unusable", async () => {
		const { ctx, switched, written } = context({ platformSupported: true });
		mkdirSync(join(home, "state", "account-engine"), {
			recursive: true,
			mode: 0o777,
		});
		chmodSync(join(home, "state", "account-engine"), 0o777);

		await usageRouter
			.createCaller(ctx)
			.setDefaultAccount({ agent: "claude", selection: null });

		expect(switched).toEqual([]);
		expect(written).toEqual([{ id: 1, defaultClaudeConfigDir: null }]);
		expect(
			readFileSync(join(home, "state", "default-claude-config-dir"), "utf8"),
		).toBe("");
	});

	it("goes through the engine where it can swap", async () => {
		const { ctx, switched, written } = context({ platformSupported: true });

		await usageRouter
			.createCaller(ctx)
			.setDefaultAccount({ agent: "claude", selection: null });

		expect(switched).toEqual([{ agent: "claude", selection: null }]);
		expect(written).toEqual([]);
	});
});
