/**
 * What `evaluate` leaves behind on the two outcomes that are not a completed
 * switch: an attempt that failed, and a decision to stay that only looks like
 * exhaustion. Both are read by the next tick, so both decide whether the
 * engine repeats itself.
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import type { UsageAccount } from "../trpc/router/usage/types.ts";
import { AccountEngine } from "./account-engine.ts";
import type {
	ClaudeLoginStoreRef,
	ClaudeSwapResult,
} from "./claude-login-swap.ts";
import { EngineState } from "./engine-state.ts";
import type { AccountEngineHostDeps } from "./host-deps.ts";
import {
	EXHAUSTED_POLL_MS,
	type QuotaEntry,
	type QuotaRefreshSchedule,
} from "./quota-store.ts";

const T0 = 1_800_000_000_000;
const ACTIVE_DIR = "/superset-home/accounts/claude-active";
const COOLDOWN_MS = 300_000;

function usageAccount(over: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "key-a",
		accountId: "acct-a",
		sourceLabel: "~/.claude",
		email: "a@example.com",
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "five_hour",
				label: "Session (5h)",
				usedPercent: 10,
				resetsAt: null,
			},
		],
		creditsBalance: null,
		extraUsage: null,
		selection: "/profiles/a",
		isDefault: false,
		inRotation: true,
		managed: true,
		fetchedAt: new Date(T0),
		...over,
	};
}

function entryFor(account: UsageAccount): QuotaEntry {
	return {
		key: `${account.agent}:${account.selection ?? "default"}`,
		agent: account.agent,
		selection: account.selection,
		accounts: [account],
		fetchedAt: T0,
		nextPollAt: T0,
		backoffMs: 0,
		lastError: null,
		tokenState: account.status,
		fetchable: true,
		inflight: null,
	};
}

function window(usedPercent: number): UsageAccount["windows"] {
	return [
		{ id: "five_hour", label: "Session (5h)", usedPercent, resetsAt: null },
	];
}

function accountB(over: Partial<UsageAccount> = {}): UsageAccount {
	return usageAccount({
		accountKey: "key-b",
		accountId: "acct-b",
		selection: "/profiles/b",
		email: "b@example.com",
		...over,
	});
}

/** Active A at 91%, spare B at 20%: one switch is due. */
function switchDue(): QuotaEntry[] {
	return [
		entryFor(usageAccount({ isDefault: true, windows: window(91) })),
		entryFor(accountB({ windows: window(20) })),
	];
}

/** Loses the lock on the single claim following `loseNextClaim = true`. */
class FlakyLockState extends EngineState {
	loseNextClaim = false;

	override claimLock(
		nonce: string,
		now: number,
		staleAfterMs?: number,
	): boolean {
		if (this.loseNextClaim) {
			this.loseNextClaim = false;
			return false;
		}
		return super.claimLock(nonce, now, staleAfterMs);
	}
}

interface Harness {
	engine: AccountEngine;
	state: FlakyLockState;
	swapped: ClaudeLoginStoreRef[];
	schedules: QuotaRefreshSchedule[];
	runtime: () => {
		cooldownUntil: number | null;
		exhaustedNotifiedAt: number | null;
		activeAccountId: string | null;
	};
	cleanup: () => void;
}

function harness(options: {
	entries: QuotaEntry[];
	setPointer?: () => void;
	onSwap?: (state: FlakyLockState, call: number) => void;
}): Harness {
	const previousHome = process.env.SUPERSET_HOME_DIR;
	const home = mkdtempSync(join(tmpdir(), "superset-account-engine-evaluate-"));
	process.env.SUPERSET_HOME_DIR = home;

	const state = new FlakyLockState();
	const seed = state.readRuntime();
	// The account sessions are on, and the binding a swap needs to save its
	// credential back into the right store.
	seed.perAgent.claude.activeAccountId = "acct-a";
	seed.perAgent.claude.activeSelection = "/profiles/a";
	seed.identityBindings["acct-a"] = "/profiles/a";
	state.writeRuntime(seed);

	const swapped: ClaudeLoginStoreRef[] = [];
	const schedules: QuotaRefreshSchedule[] = [];

	const engine = new AccountEngine({
		engineState: state,
		db: {} as HostDb,
		hostDeps: {
			listSessions: () => [],
			isAgentBusy: () => false,
			isTerminalAlive: () => true,
			killAndResume: async () => null,
			sendToTerminal: async () => {},
			snapshotTerminal: async () => null,
			hasStartedAgent: () => true,
			isBracketedPasteActive: () => true,
		} satisfies AccountEngineHostDeps,
		quotaStore: {
			entries: () => options.entries,
			entry: () => undefined,
			read: async () => [],
			refreshDue: async (_now: number, schedule: QuotaRefreshSchedule) => {
				schedules.push(schedule);
			},
			setSnapshotSink: () => {},
			setSnapshotSource: () => {},
			snapshot: () => ({ entries: [] }),
		},
		mover: {
			moveAtIdle: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
			fallbackRestart: async () => true,
			corroborateLimitStop: async () => true,
			onExternalSwitch: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
		},
		broadcast: { switched: () => {}, engineState: () => {} },
		now: () => T0,
		setIntervalFn: (() =>
			({ unref() {} }) as unknown as ReturnType<
				typeof setInterval
			>) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
		platform: "linux",
		swap: async (input: { target: ClaudeLoginStoreRef }) => {
			swapped.push(input.target);
			options.onSwap?.(state, swapped.length);
			const dir =
				input.target.kind === "profile" ? input.target.dir : "/profiles/a";
			const accountUuid = dir === "/profiles/b" ? "acct-b" : "acct-a";
			return {
				ok: true,
				identity: {
					accountUuid,
					emailAddress: null,
					keys: { oauthAccount: { accountUuid } },
				},
			} satisfies ClaudeSwapResult;
		},
		seed: async () => ({
			ok: true,
			identity: {
				accountUuid: "acct-a",
				emailAddress: null,
				keys: { oauthAccount: { accountUuid: "acct-a" } },
			},
		}),
		ensureActiveDir: async () => ACTIVE_DIR,
		setPointer: options.setPointer ?? (() => {}),
		readPointerSelections: () => ({ claudeConfigDir: null, codexHome: null }),
		updateClaudeStateFile: async () => {},
		setBindingRecorder: () => {},
		resolveActiveDir: () => ACTIVE_DIR,
		readActiveIdentity: async () => ({
			accountUuid: "acct-a",
			credentialHash: "hash-a",
		}),
		readCodexIdentity: async () => null,
	});
	expect(engine.setSettings("claude", { enabled: true }).ok).toBe(true);

	return {
		engine,
		state,
		swapped,
		schedules,
		runtime: () => {
			const written = JSON.parse(
				readFileSync(
					join(home, "state", "account-engine", "runtime.json"),
					"utf8",
				),
			) as {
				perAgent: {
					claude: {
						cooldownUntil: number | null;
						exhaustedNotifiedAt: number | null;
						activeAccountId: string | null;
					};
				};
			};
			return written.perAgent.claude;
		},
		cleanup: () => {
			if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
			else process.env.SUPERSET_HOME_DIR = previousHome;
			rmSync(home, { recursive: true, force: true });
		},
	};
}

describe("AccountEngine: a switch that failed", () => {
	it("backs off, so a persistent failure is not re-attempted every tick", async () => {
		const h = harness({
			entries: switchDue(),
			setPointer: () => {
				throw new Error("pointer is read-only");
			},
		});
		try {
			await h.engine.tick();

			// The swap, then the rollback that puts the previous login back.
			expect(h.swapped).toHaveLength(2);
			expect(h.runtime().activeAccountId).toBe("acct-a");
			expect(h.runtime().cooldownUntil).toBe(T0 + COOLDOWN_MS);

			// Same quota, same target, same failure: without the backoff this is
			// two more Keychain round-trips, and another failure notification.
			await h.engine.tick();
			expect(h.swapped).toHaveLength(2);
		} finally {
			h.cleanup();
		}
	});

	it("does not back off for a lock loser, which is another instance's switch, not a failed one", async () => {
		const h = harness({
			entries: switchDue(),
			// The lock goes stale under the first swap — the longest await in a
			// switch — and another instance reclaims it.
			onSwap: (state, call) => {
				if (call === 1) state.loseNextClaim = true;
			},
		});
		try {
			await h.engine.tick();

			expect(h.swapped).toHaveLength(2);
			expect(h.runtime().activeAccountId).toBe("acct-a");
			expect(h.runtime().cooldownUntil).toBeNull();

			// Ownership is back, so the switch this host never got to make runs
			// now rather than waiting out a cooldown it never earned.
			await h.engine.tick();
			expect(h.swapped.length).toBeGreaterThan(2);
			expect(h.runtime().activeAccountId).toBe("acct-b");
		} finally {
			h.cleanup();
		}
	});
});

describe("AccountEngine: the all-exhausted latch", () => {
	it("does not latch on an expired active login, whose fix is a sign-in and not a reset", async () => {
		const h = harness({
			entries: [
				entryFor(
					usageAccount({
						isDefault: true,
						status: "token_expired",
						windows: [],
					}),
				),
			],
		});
		try {
			await h.engine.tick();
			await h.engine.tick();

			// No "all accounts are at their limit" notification…
			expect(h.runtime().exhaustedNotifiedAt).toBeNull();
			// …and the poll stays fast, so a `claude login` is noticed at once.
			expect(h.schedules[1]?.claude?.intervalMs).toBe(60_000);
		} finally {
			h.cleanup();
		}
	});

	it("still latches when every account really is over the threshold", async () => {
		const h = harness({
			entries: [
				entryFor(usageAccount({ isDefault: true, windows: window(99) })),
				entryFor(accountB({ windows: window(99) })),
			],
		});
		try {
			await h.engine.tick();
			await h.engine.tick();

			expect(h.runtime().exhaustedNotifiedAt).toBe(T0);
			expect(h.schedules[1]?.claude?.intervalMs).toBe(EXHAUSTED_POLL_MS);
		} finally {
			h.cleanup();
		}
	});
});
