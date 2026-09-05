import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
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

	it("goes through the engine where it can swap", async () => {
		const { ctx, switched, written } = context({ platformSupported: true });

		await usageRouter
			.createCaller(ctx)
			.setDefaultAccount({ agent: "claude", selection: null });

		expect(switched).toEqual([{ agent: "claude", selection: null }]);
		expect(written).toEqual([]);
	});
});
