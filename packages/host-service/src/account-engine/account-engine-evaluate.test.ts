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
import { AccountEngine, type AccountEngineDeps } from "./account-engine.ts";
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
		activeSelection: string | null;
	};
	cleanup: () => void;
}

function harness(options: {
	entries: QuotaEntry[];
	/**
	 * The store holds nothing until `refreshDue` runs — its discovery pass is
	 * what fills the pool — which is every first tick after a host-service
	 * start.
	 */
	cold?: boolean;
	/** A host that has never recorded which login its sessions are on. */
	noActiveRecord?: boolean;
	pointer?: { claudeConfigDir: string | null; codexHome: string | null };
	setPointer?: () => void;
	seed?: AccountEngineDeps["seed"];
	readActiveIdentity?: AccountEngineDeps["readActiveIdentity"];
	hostDeps?: Partial<AccountEngineHostDeps>;
	mover?: Partial<AccountEngineDeps["mover"]>;
	onRead?: () => Promise<void>;
	onEnsureActiveDir?: (state: FlakyLockState) => void;
	onSwap?: (state: FlakyLockState, call: number) => void;
}): Harness {
	const previousHome = process.env.SUPERSET_HOME_DIR;
	const home = mkdtempSync(join(tmpdir(), "superset-account-engine-evaluate-"));
	process.env.SUPERSET_HOME_DIR = home;

	const state = new FlakyLockState();
	const seed = state.readRuntime();
	// The account sessions are on, and the binding a swap needs to save its
	// credential back into the right store.
	if (!options.noActiveRecord) {
		seed.perAgent.claude.activeAccountId = "acct-a";
		seed.perAgent.claude.activeSelection = "/profiles/a";
	}
	seed.identityBindings["acct-a"] = "/profiles/a";
	state.writeRuntime(seed);

	const swapped: ClaudeLoginStoreRef[] = [];
	const schedules: QuotaRefreshSchedule[] = [];
	let warm = options.cold !== true;

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
			...options.hostDeps,
		} satisfies AccountEngineHostDeps,
		quotaStore: {
			entries: () => (warm ? options.entries : []),
			entry: (key) => options.entries.find((entry) => entry.key === key),
			read: async () => {
				await options.onRead?.();
				return [];
			},
			refreshDue: async (_now: number, schedule: QuotaRefreshSchedule) => {
				schedules.push(schedule);
				// The discovery pass the real store runs here is what puts the
				// profiles in the pool.
				warm = true;
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
			...options.mover,
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
		seed:
			options.seed ??
			(async () => ({
				ok: true,
				identity: {
					accountUuid: "acct-a",
					emailAddress: null,
					keys: { oauthAccount: { accountUuid: "acct-a" } },
				},
			})),
		ensureActiveDir: async () => {
			options.onEnsureActiveDir?.(state);
			return ACTIVE_DIR;
		},
		provisionCodex: async () => {},
		setPointer: options.setPointer ?? (() => {}),
		readPointerSelections: () =>
			options.pointer ?? { claudeConfigDir: null, codexHome: null },
		updateClaudeStateFile: async () => {},
		setBindingRecorder: () => {},
		resolveActiveDir: () => ACTIVE_DIR,
		readActiveIdentity:
			options.readActiveIdentity ??
			(async () => ({
				accountUuid: "acct-a",
				credentialHash: "hash-a",
			})),
		readCodexIdentity: async (selection) =>
			options.entries.find((entry) => entry.selection === selection)
				?.accounts[0]?.accountId ?? null,
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
						activeSelection: string | null;
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
	it("starts no credential operation when provisioning loses ownership", async () => {
		let seedCalls = 0;
		const h = harness({
			entries: switchDue(),
			onEnsureActiveDir: (state) => {
				state.loseNextClaim = true;
			},
			seed: async () => {
				seedCalls++;
				throw new Error("must not seed");
			},
		});
		try {
			expect(
				await h.engine.switchManually("claude", "/profiles/b"),
			).toMatchObject({
				ok: false,
				code: "lock-loser",
			});
			expect(seedCalls).toBe(0);
			expect(h.swapped).toEqual([]);
			expect(h.state.readHistory()).toEqual([]);
			expect(h.runtime().activeAccountId).toBe("acct-a");
		} finally {
			h.cleanup();
		}
	});

	it("reports lock loss without rolling back or publishing a manual switch", async () => {
		let pointerWrites = 0;
		const h = harness({
			entries: switchDue(),
			setPointer: () => {
				pointerWrites++;
			},
			onSwap: (state) => {
				state.loseNextClaim = true;
			},
		});
		try {
			expect(
				await h.engine.switchManually("claude", "/profiles/b"),
			).toMatchObject({
				ok: false,
				code: "lock-loser",
			});
			expect(h.swapped).toHaveLength(1);
			expect(pointerWrites).toBe(0);
			expect(h.state.readHistory()).toEqual([]);
			expect(h.runtime().activeAccountId).toBe("acct-a");
		} finally {
			h.cleanup();
		}
	});

	it("passes the selected identity to first activation and preserves a seed refusal", async () => {
		let seedCalls = 0;
		let pointerWrites = 0;
		const h = harness({
			noActiveRecord: true,
			entries: [entryFor(accountB({ windows: window(20) }))],
			readActiveIdentity: async () => ({
				accountUuid: null,
				credentialHash: null,
			}),
			setPointer: () => {
				pointerWrites++;
			},
			seed: async (input) => {
				seedCalls++;
				expect(input).toMatchObject({
					source: { kind: "profile", dir: "/profiles/b" },
					expectedTargetAccountId: "acct-b",
				});
				return {
					ok: false,
					code: "target-changed",
					reason: "profile is now acct-c",
				};
			},
		});
		try {
			expect(
				await h.engine.switchManually("claude", "/profiles/b"),
			).toMatchObject({
				ok: false,
				code: "target-changed",
			});
			expect(seedCalls).toBe(1);
			expect(h.swapped).toHaveLength(0);
			expect(pointerWrites).toBe(0);
			expect(h.state.readHistory()).toEqual([]);
			expect(h.runtime().activeAccountId).toBeNull();
		} finally {
			h.cleanup();
		}
	});

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

			// A lock loser must not start a rollback against the new owner's login.
			expect(h.swapped).toHaveLength(1);
			expect(h.runtime().activeAccountId).toBe("acct-a");
			expect(h.runtime().cooldownUntil).toBeNull();

			// Ownership is back, so the switch this host never got to make runs
			// now rather than waiting out a cooldown it never earned.
			await h.engine.tick();
			expect(h.swapped).toHaveLength(2);
			expect(h.runtime().activeAccountId).toBe("acct-b");
		} finally {
			h.cleanup();
		}
	});
});

describe("AccountEngine: limit recovery", () => {
	it("recovers a busy Codex limit stop before a proactive switch hides its quota", async () => {
		const row = {
			agent: "codex" as const,
			terminalId: "stalled",
			workspaceId: "workspace",
			managed: true,
			configDir: "/profiles/a",
			lastEventType: "Start",
			lastEventAt: T0,
		};
		let restarts = 0;
		const h = harness({
			entries: [
				entryFor(
					usageAccount({
						agent: "codex",
						windows: window(100).map((item) => ({ ...item, id: "primary" })),
					}),
				),
				entryFor(
					accountB({
						agent: "codex",
						windows: window(20).map((item) => ({ ...item, id: "primary" })),
					}),
				),
			],
			hostDeps: {
				listSessions: (agent) => (agent === "codex" ? [row] : []),
				isAgentBusy: () => true,
			},
			mover: {
				fallbackRestart: async (session) => {
					expect(session.terminalId).toBe("stalled");
					restarts++;
					return true;
				},
			},
		});
		try {
			const runtime = h.state.readRuntime();
			runtime.perAgent.codex.activeAccountId = "acct-a";
			runtime.perAgent.codex.activeSelection = "/profiles/a";
			h.state.writeRuntime(runtime);
			h.engine.setSettings("codex", { enabled: true });
			await h.engine.tick();
			expect(restarts).toBe(1);
			expect(h.state.readRuntime().perAgent.codex.activeAccountId).toBe(
				"acct-b",
			);
			expect(
				h.state
					.readHistory()
					.filter((entry) => entry.reasonKind === "fallback"),
			).toHaveLength(1);
		} finally {
			h.cleanup();
		}
	});

	for (const change of ["disable", "exclude"] as const) {
		it(`honors ${change} during the hint quota refresh`, async () => {
			const entries = [
				entryFor(usageAccount({ windows: window(100) })),
				entryFor(accountB({ windows: window(20) })),
			];
			for (const entry of entries) entry.fetchedAt = T0 - 60_000;
			let refreshCalls = 0;
			const h = harness({
				entries,
				hostDeps: {
					listSessions: () => [
						{
							agent: "claude",
							terminalId: "stalled",
							workspaceId: "workspace",
							managed: true,
							configDir: ACTIVE_DIR,
							lastEventType: "Failed",
							lastEventAt: T0,
							limitHintErrorType: "rate_limit",
						},
					],
				},
				onRead: async () => {
					refreshCalls++;
					if (change === "disable")
						h.engine.setSettings("claude", { enabled: false });
					else h.engine.setRotation("claude:acct-b", false);
					for (const entry of entries) entry.fetchedAt = T0;
				},
			});
			try {
				await h.engine.handleLimitHints();
				expect(refreshCalls).toBe(1);
				expect(h.swapped).toEqual([]);
				expect(h.runtime().activeAccountId).toBe("acct-a");
			} finally {
				h.cleanup();
			}
		});
	}
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

describe("AccountEngine: the first tick after a boot", () => {
	it("resolves the active login once discovery has filled the pool, not off an empty one", async () => {
		// A cold store — `refreshDue` runs the discovery pass, so nothing is in
		// the pool until it has — on a host that records no active login yet.
		// The host pointer names /profiles/b, which is where the sessions are;
		// the system-default login is a different account, over its threshold.
		// Resolving before the pool exists resolves nothing, and `activeRow`
		// then reads a null id as the system default and switches off it.
		const h = harness({
			cold: true,
			noActiveRecord: true,
			pointer: { claudeConfigDir: "/profiles/b", codexHome: null },
			entries: [
				entryFor(usageAccount({ selection: null, windows: window(91) })),
				entryFor(accountB({ windows: window(20) })),
			],
		});
		try {
			await h.engine.tick();

			// Sessions are on B at 20%: nothing is due, so nothing moves and no
			// history row claims a switch that never happened.
			expect(h.swapped).toEqual([]);
			expect(h.state.readHistory()).toEqual([]);
			expect(h.runtime().activeAccountId).toBe("acct-b");
			expect(h.runtime().activeSelection).toBe("/profiles/b");
			expect(h.runtime().cooldownUntil).toBeNull();
		} finally {
			h.cleanup();
		}
	});
});
