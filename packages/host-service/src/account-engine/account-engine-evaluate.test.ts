/**
 * What `evaluate` leaves behind on the two outcomes that are not a completed
 * switch: an attempt that failed, and a decision to stay that only looks like
 * exhaustion. Both are read by the next tick, so both decide whether the
 * engine repeats itself.
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
	heartbeats: number[] = [];
	failRuntimeWrites = 0;

	override writeRuntime(
		runtime: Parameters<EngineState["writeRuntime"]>[0],
	): void {
		if (this.failRuntimeWrites > 0) {
			this.failRuntimeWrites--;
			throw new Error("runtime write failed");
		}
		super.writeRuntime(runtime);
	}

	override claimLock(
		nonce: string,
		now: number,
		staleAfterMs?: number,
	): boolean {
		if (this.loseNextClaim) {
			this.loseNextClaim = false;
			return false;
		}
		const owned = super.claimLock(nonce, now, staleAfterMs);
		if (owned) {
			this.heartbeats.push(
				JSON.parse(readFileSync(join(this.dir, "engine.lock"), "utf8"))
					.heartbeatAt,
			);
		}
		return owned;
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
	setPointer?: AccountEngineDeps["setPointer"];
	swap?: AccountEngineDeps["swap"];
	provisionClaude?: AccountEngineDeps["provisionClaude"];
	seed?: AccountEngineDeps["seed"];
	readActiveIdentity?: AccountEngineDeps["readActiveIdentity"];
	hostDeps?: Partial<AccountEngineHostDeps>;
	mover?: Partial<AccountEngineDeps["mover"]>;
	onRead?: () => Promise<void>;
	onRefresh?: () => Promise<void>;
	setSnapshotSink?: AccountEngineDeps["quotaStore"]["setSnapshotSink"];
	onEnsureActiveDir?: (state: FlakyLockState) => void;
	onSwap?: (state: FlakyLockState, call: number) => void;
	now?: () => number;
	onSwitched?: AccountEngineDeps["broadcast"]["switched"];
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
				await options.onRefresh?.();
			},
			setSnapshotSink: options.setSnapshotSink ?? (() => {}),
			setSnapshotSource: () => {},
			snapshot: () => ({ entries: [] }),
		},
		mover: {
			moveAtIdle: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
			fallbackRestart: async () => true,
			observeLimitStop: async () => ({
				model: null,
				source: "terminal" as const,
			}),
			onExternalSwitch: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
			...options.mover,
		},
		broadcast: {
			switched: options.onSwitched ?? (() => {}),
			engineState: () => {},
		},
		now: options.now ?? (() => T0),
		setIntervalFn: (() =>
			({ unref() {} }) as unknown as ReturnType<
				typeof setInterval
			>) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
		platform: "linux",
		swap:
			options.swap ??
			(async (input: { target: ClaudeLoginStoreRef }) => {
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
			}),
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
		provisionClaude: options.provisionClaude ?? (async () => {}),
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

describe("AccountEngine: quota publication ownership", () => {
	for (const handover of [false, true]) {
		it(`publishes an in-flight refresh only while its nonce owns the lock (handover=${handover})`, async () => {
			let release = () => {};
			let started = () => {};
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const entered = new Promise<void>((resolve) => {
				started = resolve;
			});
			const publisher: {
				sink: Parameters<AccountEngineDeps["quotaStore"]["setSnapshotSink"]>[0];
			} = { sink: null };
			const h = harness({
				entries: [],
				setSnapshotSink: (sink) => {
					publisher.sink = sink;
				},
				onRefresh: async () => {
					started();
					await gate;
					publisher.sink?.({ entries: [] });
				},
			});
			const tick = h.engine.tick();
			try {
				await entered;
				const successorSnapshot = { entries: [], successor: true };
				if (handover) {
					expect(h.state.claimLock("successor", T0 + 200_000)).toBe(true);
					h.state.writeQuotaSnapshot(successorSnapshot, T0 + 200_000);
				}
				release();
				await tick;
				expect(h.state.readQuotaSnapshot()).toEqual({
					writtenAt: handover ? T0 + 200_000 : T0,
					data: handover ? successorSnapshot : { entries: [] },
				});
			} finally {
				release();
				await tick;
				h.cleanup();
			}
		});
	}
});

describe("AccountEngine: queued lease renewal", () => {
	for (const operation of ["tick", "hint"] as const) {
		it(`renews the lease at execution time after a queued ${operation}`, async () => {
			let now = T0;
			const h = harness({ entries: [], now: () => now });
			let release = () => {};
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const blocking = h.engine.runExclusive(() => gate);
			const queued =
				operation === "tick" ? h.engine.tick() : h.engine.handleLimitHints();
			try {
				now += 100_000;
				// A synchronous settings change renews the lease while the older
				// operation is still queued. Its later claim must not rewind it.
				expect(h.engine.setSettings("claude", { enabled: true }).ok).toBe(true);
				expect(h.state.heartbeats.at(-1)).toBe(now);
				h.state.heartbeats.length = 0;
				release();
				await blocking;
				await queued;
				expect(h.state.heartbeats.length).toBeGreaterThan(0);
				expect(h.state.heartbeats.every((heartbeat) => heartbeat === now)).toBe(
					true,
				);
			} finally {
				release();
				await blocking;
				await queued;
				h.cleanup();
			}
		});
	}
});

describe("AccountEngine: a switch that failed", () => {
	for (const recovery of [
		"tick",
		"hint",
		"manual",
		"ownership-loss",
	] as const) {
		it(`recovers a failed runtime commit through ${recovery} without replaying the switch`, async () => {
			const pointer = {
				claudeConfigDir: null,
				codexHome: "/profiles/a" as string | null,
			};
			const moves: Array<string | null> = [];
			let events = 0;
			const h = harness({
				pointer,
				entries: [
					entryFor(usageAccount({ agent: "codex" })),
					entryFor(accountB({ agent: "codex" })),
				],
				setPointer: (_db, _agent, selection) => {
					pointer.codexHome = selection;
				},
				onSwitched: () => {
					events++;
				},
				mover: {
					moveAtIdle: async () => {
						moves.push(pointer.codexHome);
						return { movedTerminalIds: [], deferredTerminalIds: [] };
					},
				},
			});
			try {
				const before = h.state.readRuntime();
				before.perAgent.codex.activeAccountId = "acct-a";
				before.perAgent.codex.activeSelection = "/profiles/a";
				h.state.writeRuntime(before);
				h.state.failRuntimeWrites = 1;
				await expect(
					h.engine.switchManually("codex", "/profiles/b"),
				).rejects.toThrow("runtime write failed");
				expect(pointer.codexHome).toBe("/profiles/b");
				expect(h.state.readRuntime().perAgent.codex.activeAccountId).toBe(
					"acct-a",
				);
				expect(moves).toEqual([]);
				expect(events).toBe(0);
				// Discovery may update unrelated bindings before the retry.
				const discovered = h.state.readRuntime();
				discovered.identityBindings["new-account"] = "/profiles/new";
				h.state.writeRuntime(discovered);
				if (recovery === "ownership-loss") {
					expect(h.state.claimLock("successor", T0 + 200_000)).toBe(true);
					discovered.perAgent.codex.activeAccountId = "successor-account";
					h.state.writeRuntime(discovered);
					await h.engine.tick();
					expect(h.state.readRuntime().perAgent.codex.activeAccountId).toBe(
						"successor-account",
					);
					expect(events).toBe(0);
					expect(moves).toEqual([]);
				} else {
					if (recovery === "manual") {
						expect(
							await h.engine.switchManually("codex", "/profiles/a"),
						).toEqual({ ok: true });
					} else if (recovery === "hint") await h.engine.handleLimitHints();
					else await h.engine.tick();
					expect(h.state.readRuntime().perAgent.codex.activeAccountId).toBe(
						recovery === "manual" ? "acct-a" : "acct-b",
					);
					expect(moves).toEqual(
						recovery === "manual"
							? ["/profiles/b", "/profiles/a"]
							: ["/profiles/b"],
					);
					expect(events).toBe(recovery === "manual" ? 2 : 1);
					expect(h.state.readHistory()).toHaveLength(events);
					await h.engine.tick();
					expect(moves).toHaveLength(events);
				}
				expect(h.state.readRuntime().identityBindings["new-account"]).toBe(
					"/profiles/new",
				);
			} finally {
				h.cleanup();
			}
		});
	}

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

describe("AccountEngine: API-billed Claude profiles", () => {
	it("refuses an API profile whose billing marker changes during provisioning", async () => {
		const dir = mkdtempSync(join(tmpdir(), "superset-api-profile-"));
		writeFileSync(join(dir, ".superset-api-billing"), "claude");
		const pointer = {
			claudeConfigDir: ACTIVE_DIR as string | null,
			codexHome: null,
		};
		const h = harness({
			pointer,
			entries: [
				entryFor(usageAccount({})),
				entryFor(
					accountB({
						selection: dir,
						accountId: null,
						credentialKind: "api_key",
						windows: [],
					}),
				),
			],
			provisionClaude: async () => {
				rmSync(join(dir, ".superset-api-billing"));
			},
			setPointer: (_db, _agent, selection) => {
				pointer.claudeConfigDir = selection;
			},
		});
		try {
			expect(await h.engine.switchManually("claude", dir)).toMatchObject({
				ok: false,
				code: "target-changed",
			});
			expect(pointer.claudeConfigDir).toBe(ACTIVE_DIR);
			expect(h.state.readHistory(10)).toEqual([]);
		} finally {
			h.cleanup();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("can return from API billing after a successful swap resolves identity uncertainty", async () => {
		const dir = mkdtempSync(join(tmpdir(), "superset-api-profile-"));
		writeFileSync(join(dir, ".superset-api-billing"), "claude");
		const pointer = {
			claudeConfigDir: ACTIVE_DIR as string | null,
			codexHome: null,
		};
		let seen = { accountUuid: "acct-b", credentialHash: "hash-b" };
		const h = harness({
			pointer,
			entries: [
				entryFor(usageAccount({})),
				entryFor(accountB()),
				entryFor(
					accountB({
						accountKey: "api",
						selection: dir,
						accountId: null,
						credentialKind: "api_key",
						windows: [],
					}),
				),
			],
			readActiveIdentity: async () => seen,
			setPointer: (_db, _agent, selection) => {
				pointer.claudeConfigDir = selection;
			},
		});
		try {
			expect(await h.engine.switchManually("claude", "/profiles/b")).toEqual({
				ok: true,
			});
			seen = { accountUuid: "acct-a", credentialHash: "changed-credential" };
			h.engine.setSettings("claude", { enabled: false });
			await h.engine.tick();
			// An authoritative swap resolves the parked identity before any next tick.
			expect(await h.engine.switchManually("claude", "/profiles/a")).toEqual({
				ok: true,
			});
			expect(h.swapped).toHaveLength(2);
			expect(await h.engine.switchManually("claude", dir)).toEqual({
				ok: true,
			});
			await h.engine.tick();
			expect(await h.engine.switchManually("claude", "/profiles/a")).toEqual({
				ok: true,
			});
			expect(pointer.claudeConfigDir).toBe(ACTIVE_DIR);
			expect(h.runtime().activeAccountId).toBe("acct-a");
			expect(h.swapped).toHaveLength(2);
		} finally {
			h.cleanup();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	for (const drift of ["stale-identity", "indeterminate"] as const) {
		it(`refuses an API -> OAuth return with ${drift}`, async () => {
			const dir = mkdtempSync(join(tmpdir(), "superset-api-profile-"));
			writeFileSync(join(dir, ".superset-api-billing"), "claude");
			const pointer = {
				claudeConfigDir: ACTIVE_DIR as string | null,
				codexHome: null,
			};
			let seen = { accountUuid: "acct-b", credentialHash: "hash-b" };
			const h = harness({
				pointer,
				entries: [
					entryFor(usageAccount({})),
					entryFor(accountB()),
					entryFor(
						accountB({
							accountKey: "api",
							selection: dir,
							accountId: null,
							credentialKind: "api_key",
							windows: [],
						}),
					),
				],
				readActiveIdentity: async () => seen,
				setPointer: (_db, _agent, selection) => {
					pointer.claudeConfigDir = selection;
				},
			});
			try {
				expect(await h.engine.switchManually("claude", "/profiles/b")).toEqual({
					ok: true,
				});
				if (drift === "indeterminate") {
					seen = {
						accountUuid: "acct-a",
						credentialHash: "changed-credential",
					};
					h.engine.setSettings("claude", { enabled: false });
					await h.engine.tick();
				}
				expect(await h.engine.switchManually("claude", dir)).toEqual({
					ok: true,
				});
				seen = {
					accountUuid: drift === "stale-identity" ? "acct-a" : "acct-b",
					credentialHash: "hash-b",
				};
				const before = h.state.readHistory();
				expect(
					await h.engine.switchManually(
						"claude",
						drift === "stale-identity" ? "/profiles/a" : "/profiles/b",
					),
				).toMatchObject({ ok: false, code: "owner-unknown" });
				expect(h.swapped).toHaveLength(1);
				expect(pointer.claudeConfigDir).toBe(dir);
				expect(h.runtime().activeSelection).toBe(dir);
				expect(h.state.readHistory()).toEqual(before);
			} finally {
				h.cleanup();
				rmSync(dir, { recursive: true, force: true });
			}
		});
	}

	it("follows API changes without moving current idle or busy sessions", async () => {
		let selected = "/profiles/api";
		const moved: string[][] = [];
		const h = harness({
			entries: ["/profiles/api", "/profiles/api2"].map((selection) =>
				entryFor(
					accountB({
						accountKey: selection,
						selection,
						accountId: null,
						credentialKind: "api_key",
						windows: [],
					}),
				),
			),
			hostDeps: {
				listSessions: () =>
					["idle", "busy", "stale"].map((terminalId) => ({
						agent: "claude",
						workspaceId: "workspace",
						terminalId,
						managed: true,
						configDir: terminalId === "stale" ? ACTIVE_DIR : `${selected}/.`,
						lastEventType: terminalId === "busy" ? "Start" : "Stop",
						lastEventAt: T0,
					})),
			},
			mover: {
				onExternalSwitch: async () => {
					throw new Error("must filter before moving");
				},
				moveAtIdle: async (_agent, rows = []) => {
					moved.push(rows.map((row) => row.terminalId));
					return { movedTerminalIds: [], deferredTerminalIds: [] };
				},
			},
		});
		try {
			for (const selection of ["/profiles/api", "/profiles/api2"]) {
				selected = selection;
				const runtime = h.state.readRuntime();
				runtime.perAgent.claude.activeAccountId = null;
				runtime.perAgent.claude.activeSelection = selection;
				h.state.writeRuntime(runtime);
				h.state.loseNextClaim = true;
				await h.engine.tick();
			}
			expect(moved).toEqual([["stale"], ["stale"]]);
		} finally {
			h.cleanup();
		}
	});

	for (const firstActivation of [false, true]) {
		it(`activates the API profile itself with firstActivation=${firstActivation}`, async () => {
			const dir = mkdtempSync(join(tmpdir(), "superset-api-profile-"));
			writeFileSync(join(dir, ".superset-api-billing"), "claude");
			writeFileSync(
				join(dir, "settings.json"),
				'{"env":{"ANTHROPIC_API_KEY":"test-key"}}',
			);
			const pointer = {
				claudeConfigDir: firstActivation ? null : ACTIVE_DIR,
				codexHome: null,
			};
			const moved: string[] = [];
			const h = harness({
				noActiveRecord: firstActivation,
				pointer,
				entries: [
					entryFor(usageAccount({})),
					entryFor(
						accountB({
							selection: dir,
							accountId: null,
							credentialKind: "api_key",
							windows: [],
						}),
					),
				],
				swap: async () => {
					throw new Error("API activation must not swap OAuth");
				},
				seed: async () => {
					throw new Error("API activation must not seed OAuth");
				},
				setPointer: (_db, _agent, selection) => {
					pointer.claudeConfigDir = selection;
				},
				hostDeps: {
					listSessions: () => [
						{
							agent: "claude",
							workspaceId: "workspace",
							terminalId: "old-session",
							managed: true,
							configDir: ACTIVE_DIR,
							lastEventType: "Stop",
							lastEventAt: T0,
						},
					],
				},
				mover: {
					moveAtIdle: async (_agent, rows = []) => {
						moved.push(...rows.map((row) => row.terminalId));
						return { movedTerminalIds: moved, deferredTerminalIds: [] };
					},
				},
			});
			try {
				expect(await h.engine.switchManually("claude", dir)).toEqual({
					ok: true,
				});
				expect(pointer.claudeConfigDir).toBe(dir);
				expect(h.runtime().activeSelection).toBe(dir);
				expect(h.runtime().activeAccountId).toBeNull();
				expect(moved).toEqual(["old-session"]);
				expect(readFileSync(join(dir, "settings.json"), "utf8")).toContain(
					"test-key",
				);
				expect(h.state.readHistory()).toHaveLength(1);
				moved.length = 0;
				h.state.loseNextClaim = true;
				await h.engine.tick();
				expect(moved).toEqual(["old-session"]);
			} finally {
				h.cleanup();
				rmSync(dir, { recursive: true, force: true });
			}
		});
	}

	for (const target of ["a", "b"] as const) {
		it(`returns from API billing to OAuth ${target} without assigning the retained login to the API profile`, async () => {
			const dir = mkdtempSync(join(tmpdir(), "superset-api-profile-"));
			writeFileSync(join(dir, ".superset-api-billing"), "claude");
			const pointer = {
				claudeConfigDir: ACTIVE_DIR as string | null,
				codexHome: null,
			};
			let swaps = 0;
			const h = harness({
				pointer,
				entries: [
					entryFor(usageAccount({})),
					entryFor(accountB()),
					entryFor(
						accountB({
							accountKey: "api",
							selection: dir,
							accountId: null,
							credentialKind: "api_key",
							windows: [],
						}),
					),
				],
				setPointer: (_db, _agent, selection) => {
					pointer.claudeConfigDir = selection;
				},
				swap: async (input) => {
					swaps++;
					expect(input.ownerBinding).toEqual({
						kind: "profile",
						dir: "/profiles/a",
					});
					expect(input.expectedOwnerAccountId).toBe("acct-a");
					return {
						ok: true,
						identity: { accountUuid: "acct-b", emailAddress: null, keys: {} },
					};
				},
			});
			try {
				expect(await h.engine.switchManually("claude", dir)).toEqual({
					ok: true,
				});
				expect(
					await h.engine.switchManually("claude", `/profiles/${target}`),
				).toEqual({ ok: true });
				expect(swaps).toBe(target === "a" ? 0 : 1);
				expect(pointer.claudeConfigDir).toBe(ACTIVE_DIR);
				expect(h.runtime().activeAccountId).toBe(`acct-${target}`);
				expect(h.state.readHistory()[0]?.fromAccountId).toBeNull();
			} finally {
				h.cleanup();
				rmSync(dir, { recursive: true, force: true });
			}
		});
	}

	it("keeps runtime unchanged when the API profile pointer cannot be written", async () => {
		const dir = mkdtempSync(join(tmpdir(), "superset-api-profile-"));
		writeFileSync(join(dir, ".superset-api-billing"), "claude");
		const h = harness({
			entries: [
				entryFor(usageAccount({})),
				entryFor(
					accountB({
						selection: dir,
						accountId: null,
						credentialKind: "api_key",
						windows: [],
					}),
				),
			],
			setPointer: () => {
				throw new Error("pointer refused");
			},
		});
		try {
			expect(await h.engine.switchManually("claude", dir)).toMatchObject({
				ok: false,
				code: "pointer-failed",
			});
			expect(h.runtime().activeAccountId).toBe("acct-a");
			expect(h.swapped).toEqual([]);
			expect(h.state.readHistory()).toEqual([]);
		} finally {
			h.cleanup();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("AccountEngine: limit recovery", () => {
	it("ignores a limit hint from an active API account before corroboration", async () => {
		let corroborations = 0;
		let reads = 0;
		const h = harness({
			entries: [
				entryFor(usageAccount({ credentialKind: "api_key", windows: [] })),
				entryFor(accountB({ windows: window(20) })),
			],
			hostDeps: {
				listSessions: () => [
					{
						agent: "claude",
						terminalId: "api",
						workspaceId: "workspace",
						managed: true,
						configDir: ACTIVE_DIR,
						lastEventType: "Failed",
						lastEventAt: T0,
						limitHintErrorType: "rate_limit",
					},
				],
			},
			mover: {
				observeLimitStop: async () => {
					corroborations++;
					return { model: null, source: "terminal" as const };
				},
			},
			onRead: async () => {
				reads++;
			},
		});
		try {
			await h.engine.handleLimitHints();
			expect(corroborations).toBe(0);
			expect(reads).toBe(0);
			expect(h.runtime().activeAccountId).toBe("acct-a");
			expect(h.swapped).toEqual([]);
			expect(h.state.readHistory()).toEqual([]);
		} finally {
			h.cleanup();
		}
	});

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
	for (const withDefault of [false, true]) {
		it(`resolves a deduplicated pointer without replacing its selection (default=${withDefault})`, async () => {
			const pollIntervalSeconds = withDefault ? 60 : 30;
			const representative = entryFor(accountB({ windows: window(20) }));
			representative.duplicateSelections = ["/profiles/original"];
			const h = harness({
				cold: true,
				noActiveRecord: true,
				pointer: { claudeConfigDir: "/profiles/original", codexHome: null },
				entries: [
					...(withDefault
						? [entryFor(usageAccount({ selection: null, windows: window(99) }))]
						: []),
					representative,
				],
				readActiveIdentity: async () => ({
					accountUuid: "acct-b",
					credentialHash: "hash-b",
				}),
			});
			try {
				expect(h.engine.setSettings("claude", { pollIntervalSeconds }).ok).toBe(
					true,
				);
				await h.engine.tick();
				await h.engine.tick();
				expect(h.runtime().activeAccountId).toBe("acct-b");
				expect(h.runtime().activeSelection).toBe("/profiles/original");
				expect(h.swapped).toEqual([]);
				expect(h.state.readHistory()).toEqual([]);
				expect(representative.accounts[0]?.selection).toBe("/profiles/b");
				expect(h.schedules.at(-1)?.claude).toEqual({
					activeKey: representative.key,
					intervalMs: pollIntervalSeconds * 1000,
				});
			} finally {
				h.cleanup();
			}
		});
	}

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
