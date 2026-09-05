import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import type {
	AccountEngineStatePayload,
	AccountSwitchedPayload,
} from "../events/types.ts";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../trpc/router/usage/types.ts";
import { AccountEngine } from "./account-engine.ts";
import type { ClaudeSwapResult } from "./claude-login-swap.ts";
import { EngineState } from "./engine-state.ts";
import type { AccountEngineHostDeps } from "./host-deps.ts";
import type { QuotaEntry, QuotaRefreshSchedule } from "./quota-store.ts";
import type { MovableSession } from "./session-mover.ts";
import type { AccountAgent } from "./types.ts";

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

function w(
	id: string,
	label: string,
	usedPercent: number,
	resetsAt: number | null = null,
): UsageQuotaWindow {
	return {
		id,
		label,
		usedPercent,
		resetsAt: resetsAt === null ? null : new Date(resetsAt),
	};
}

function usageAccount(over: Partial<UsageAccount> = {}): UsageAccount {
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
		windows: [w("five_hour", "Session (5h)", 10)],
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

function entryFor(
	account: UsageAccount,
	over: Partial<QuotaEntry> = {},
): QuotaEntry {
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
		...over,
	};
}

const ACTIVE_DIR = "/superset-home/accounts/claude-active";

function movableSession(over: Partial<MovableSession> = {}): MovableSession {
	return {
		workspaceId: "ws-1",
		terminalId: "term-1",
		agent: "claude",
		managed: true,
		configDir: "/profiles/a",
		lastEventType: "Stop",
		lastEventAt: T0,
		...over,
	};
}

interface HarnessOptions {
	entries?: QuotaEntry[];
	sessions?: MovableSession[];
	swapResult?: ClaudeSwapResult;
	corroborates?: boolean;
	platform?: NodeJS.Platform;
	activeDirThrows?: boolean;
	/** The host pointer per agent, as `getDefaultAccountSelections` reads it. */
	pointer?: { claudeConfigDir?: string | null; codexHome?: string | null };
}

function harness(options: HarnessOptions = {}) {
	const calls: string[] = [];
	const switched: AccountSwitchedPayload[] = [];
	const engineStates: AccountEngineStatePayload[] = [];
	const schedules: Array<{ now: number; schedule: QuotaRefreshSchedule }> = [];
	const pointers: Array<{ agent: string; selection: string | null }> = [];
	const moved: Array<{
		agent: AccountAgent;
		rows: MovableSession[] | undefined;
	}> = [];
	const restarted: MovableSession[] = [];
	const externalSwitches: AccountAgent[] = [];
	const identityWrites: string[] = [];
	let clock = T0;
	let entries = options.entries ?? [];
	let sessions = options.sessions ?? [];
	let activeIdentity: {
		accountUuid: string | null;
		credentialHash: string | null;
	} = { accountUuid: "acct-a", credentialHash: "hash-a" };
	let seeded = false;

	const engineState = new EngineState();

	const hostDeps = {
		listSessions: (agent: AccountAgent) =>
			sessions.filter((row) => row.agent === agent),
		isAgentBusy: () => false,
		isTerminalAlive: () => true,
		killAndResume: async () => null,
		sendToTerminal: async () => {},
		snapshotTerminal: async () => null,
		hasStartedAgent: () => true,
		isBracketedPasteActive: () => true,
	} satisfies AccountEngineHostDeps;

	const engine = new AccountEngine({
		engineState,
		db: {} as HostDb,
		hostDeps,
		quotaStore: {
			entries: (agent) =>
				agent === undefined
					? entries
					: entries.filter((entry) => entry.agent === agent),
			entry: (key) => entries.find((entry) => entry.key === key),
			refreshDue: async (now, schedule) => {
				calls.push("refreshDue");
				schedules.push({ now, schedule });
			},
			setSnapshotSink: () => {},
			snapshot: () => ({ entries: [] }),
		},
		mover: {
			moveAtIdle: async (agent, rows) => {
				calls.push("moveAtIdle");
				moved.push({ agent, rows });
				return { movedTerminalIds: [], deferredTerminalIds: [] };
			},
			fallbackRestart: async (row) => {
				calls.push("fallbackRestart");
				restarted.push(row);
				return true;
			},
			corroborateLimitStop: async () => {
				calls.push("corroborate");
				return options.corroborates ?? true;
			},
			onExternalSwitch: async (agent) => {
				externalSwitches.push(agent);
				return { movedTerminalIds: [], deferredTerminalIds: [] };
			},
		},
		broadcast: {
			switched: (payload) => switched.push(payload),
			engineState: (payload) => engineStates.push(payload),
		},
		now: () => clock,
		setIntervalFn: (() =>
			({ unref() {} }) as unknown as ReturnType<
				typeof setInterval
			>) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
		platform: options.platform ?? "linux",
		swap: async () => {
			calls.push("swap");
			const result = options.swapResult ?? {
				ok: true,
				identity: swapIdentity("acct-b"),
			};
			if (result.ok) {
				activeIdentity = {
					accountUuid: result.identity.accountUuid,
					credentialHash: "swapped",
				};
			}
			return result;
		},
		seed: async () => {
			calls.push("seed");
			return { ok: true, identity: swapIdentity("acct-a") };
		},
		ensureActiveDir: async (opts) => {
			if (options.activeDirThrows) throw new Error("permission denied");
			// Mirrors ensureActiveClaudeDir: the seed runs only on a dir that
			// has never held a login.
			if (!seeded) {
				seeded = true;
				await opts?.seedLogin?.(ACTIVE_DIR);
			}
			return ACTIVE_DIR;
		},
		setPointer: (_db, agent, selection) => {
			calls.push("setPointer");
			pointers.push({ agent, selection });
		},
		readPointerSelections: () => ({
			claudeConfigDir: options.pointer?.claudeConfigDir ?? null,
			codexHome: options.pointer?.codexHome ?? null,
		}),
		updateClaudeStateFile: async (path) => {
			identityWrites.push(path);
		},
		resolveActiveDir: () => ACTIVE_DIR,
		readActiveIdentity: async () => activeIdentity,
	});

	return {
		engine,
		engineState,
		calls,
		switched,
		engineStates,
		schedules,
		pointers,
		moved,
		restarted,
		externalSwitches,
		identityWrites,
		advance: (ms: number) => {
			clock += ms;
		},
		at: () => clock,
		setEntries: (next: QuotaEntry[]) => {
			entries = next;
		},
		setSessions: (next: MovableSession[]) => {
			sessions = next;
		},
		setActiveIdentity: (next: {
			accountUuid: string | null;
			credentialHash: string | null;
		}) => {
			activeIdentity = next;
		},
	};
}

function swapIdentity(accountUuid: string) {
	return {
		accountUuid,
		emailAddress: null,
		keys: { oauthAccount: { accountUuid } },
	};
}

/** Active account A at 91%, spare account B at 20%: one switch is due. */
function twoClaudeAccounts(): QuotaEntry[] {
	return [
		entryFor(
			usageAccount({
				windows: [w("five_hour", "Session (5h)", 91)],
				isDefault: true,
			}),
		),
		entryFor(
			usageAccount({
				accountKey: "key-b",
				accountId: "acct-b",
				selection: "/profiles/b",
				email: "b@example.com",
				windows: [w("five_hour", "Session (5h)", 20)],
			}),
		),
	];
}

describe("AccountEngine", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	function enable(engine: AccountEngine, agent: AccountAgent = "claude") {
		const result = engine.setSettings(agent, { enabled: true });
		expect(result.ok).toBe(true);
	}

	it("swaps, then moves the pointer, then moves the sessions", async () => {
		const h = harness({
			entries: twoClaudeAccounts(),
			sessions: [
				movableSession(),
				movableSession({ terminalId: "term-2", configDir: ACTIVE_DIR }),
			],
		});
		enable(h.engine);

		await h.engine.tick();

		expect(h.calls.filter((c) => c !== "refreshDue" && c !== "seed")).toEqual([
			"swap",
			"setPointer",
			"moveAtIdle",
		]);
		expect(h.pointers).toEqual([{ agent: "claude", selection: ACTIVE_DIR }]);
		// KTD12/R6: a session already running on the active dir hot-swaps and
		// must not be restarted under the user.
		expect(h.moved[0]?.rows?.map((row) => row.terminalId)).toEqual(["term-1"]);
	});

	it("broadcasts a structured switch scoped to the agent", async () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);

		await h.engine.tick();

		expect(h.switched).toEqual([
			{
				scope: "claude",
				agent: "claude",
				fromAccountId: "acct-a",
				fromLabel: "a@example.com",
				toAccountId: "acct-b",
				toLabel: "b@example.com",
				reasonKind: "threshold",
				windowId: "five_hour",
				usedPercent: 91,
				at: T0,
				fallbackRestart: false,
			},
		]);
	});

	it("records the switch in history and starts the cooldown", async () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);

		await h.engine.tick();

		const history = h.engineState.readHistory(10);
		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			agent: "claude",
			fromAccountId: "acct-a",
			toAccountId: "acct-b",
			reasonKind: "threshold",
		});
		expect(h.engine.status().claude.cooldownUntil).toBe(T0 + 5 * MINUTE);
		expect(h.engine.status().claude.activeAccountId).toBe("acct-b");
	});

	// AE6.
	it("does not switch again during the cooldown", async () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);
		await h.engine.tick();

		h.setEntries([
			entryFor(
				usageAccount({
					accountKey: "key-b",
					accountId: "acct-b",
					selection: "/profiles/b",
					windows: [w("five_hour", "Session (5h)", 95)],
				}),
			),
			entryFor(usageAccount({ windows: [w("five_hour", "Session (5h)", 5)] })),
		]);
		h.advance(2 * MINUTE);
		await h.engine.tick();

		expect(h.switched).toHaveLength(1);
	});

	it("leaves the pointer and the active account alone when the swap fails", async () => {
		const h = harness({
			entries: twoClaudeAccounts(),
			swapResult: { ok: false, code: "verify-failed", reason: "mismatch" },
		});
		enable(h.engine);

		await h.engine.tick();

		expect(h.calls).not.toContain("setPointer");
		expect(h.calls).not.toContain("moveAtIdle");
		expect(h.switched).toEqual([]);
		expect(h.engine.status().claude.activeAccountId).toBe("acct-a");
		expect(
			h.engineStates.find((event) => event.lastSwitchFailure)
				?.lastSwitchFailure,
		).toEqual({ code: "verify-failed", at: T0 });
	});

	it("reports a failure when the active dir cannot be prepared", async () => {
		const h = harness({ entries: twoClaudeAccounts(), activeDirThrows: true });
		enable(h.engine);

		await h.engine.tick();

		expect(h.calls).not.toContain("swap");
		expect(
			h.engineStates.find((event) => event.lastSwitchFailure)?.lastSwitchFailure
				?.code,
		).toBe("active-dir-unavailable");
	});

	// AE9.
	it("latches all-exhausted, notifies once, and schedules a wake at the nearest reset", async () => {
		const resetsAt = T0 + 90 * MINUTE;
		const h = harness({
			entries: [
				entryFor(
					usageAccount({
						isDefault: true,
						windows: [w("five_hour", "Session (5h)", 96, resetsAt)],
					}),
				),
				entryFor(
					usageAccount({
						accountKey: "key-b",
						accountId: "acct-b",
						selection: "/profiles/b",
						windows: [w("five_hour", "Session (5h)", 99, T0 + 4 * 60 * MINUTE)],
					}),
				),
			],
		});
		enable(h.engine);

		await h.engine.tick();
		const exhaustedEvents = h.engineStates.filter((event) => event.exhausted);
		expect(exhaustedEvents).toHaveLength(1);
		expect(h.calls).not.toContain("swap");

		// The latch is set during this tick, so the slow cadence and the wake
		// reach the store on the next one — and no second notification does.
		h.advance(MINUTE);
		await h.engine.tick();
		expect(h.schedules.at(-1)?.schedule.claude?.wakeAt).toBe(resetsAt);
		expect(h.schedules.at(-1)?.schedule.claude?.intervalMs).toBe(10 * 60_000);
		expect(h.engineStates.filter((event) => event.exhausted)).toHaveLength(1);
	});

	it("clears the exhaustion latch once an account has room again", async () => {
		const h = harness({
			entries: [
				entryFor(
					usageAccount({
						isDefault: true,
						windows: [w("five_hour", "Session (5h)", 96)],
					}),
				),
			],
		});
		enable(h.engine);
		await h.engine.tick();
		expect(h.engine.status().claude.exhausted).toBe(true);

		h.setEntries(twoClaudeAccounts());
		h.advance(10 * MINUTE);
		await h.engine.tick();

		expect(h.engine.status().claude.exhausted).toBe(false);
		expect(h.switched).toHaveLength(1);
	});

	it("runs the fallback gates in order and restarts the stopped session", async () => {
		const h = harness({
			entries: [
				entryFor(
					usageAccount({
						isDefault: true,
						windows: [w("five_hour", "Session (5h)", 100)],
					}),
				),
				entryFor(
					usageAccount({
						accountKey: "key-b",
						accountId: "acct-b",
						selection: "/profiles/b",
						windows: [w("five_hour", "Session (5h)", 10)],
					}),
				),
			],
			sessions: [movableSession({ limitHintErrorType: "rate_limit" })],
		});
		enable(h.engine);

		await h.engine.handleLimitHints();

		expect(h.calls).toEqual([
			"corroborate",
			"refreshDue",
			"seed",
			"swap",
			"setPointer",
			"moveAtIdle",
			"fallbackRestart",
		]);
		expect(h.switched.at(-1)?.reasonKind).toBe("fallback");
		expect(h.restarted.map((row) => row.terminalId)).toEqual(["term-1"]);
	});

	it("does not restart when a corroborated stop has no eligible target", async () => {
		const h = harness({
			entries: [
				entryFor(
					usageAccount({
						isDefault: true,
						windows: [w("five_hour", "Session (5h)", 100)],
					}),
				),
			],
			sessions: [movableSession({ limitHintErrorType: "rate_limit" })],
		});
		enable(h.engine);

		await h.engine.handleLimitHints();

		expect(h.calls).not.toContain("fallbackRestart");
		expect(h.calls).not.toContain("swap");
		expect(h.engine.status().claude.exhausted).toBe(true);
	});

	it("records a rejected hint instead of switching on it", async () => {
		const h = harness({
			entries: twoClaudeAccounts(),
			sessions: [movableSession({ limitHintErrorType: "rate_limit" })],
			corroborates: false,
		});
		enable(h.engine);

		await h.engine.handleLimitHints();

		expect(h.calls).not.toContain("swap");
		expect(h.engineState.readHistory(10)[0]).toMatchObject({
			reasonKind: "fallback-rejected",
			agent: "claude",
		});
	});

	// AE8/R4.
	it("switches manually, resets the cooldown and the latch, and stays enabled", async () => {
		const h = harness({
			entries: [
				entryFor(
					usageAccount({
						isDefault: true,
						windows: [w("five_hour", "Session (5h)", 96)],
					}),
				),
				entryFor(
					usageAccount({
						accountKey: "key-b",
						accountId: "acct-b",
						selection: "/profiles/b",
						windows: [w("five_hour", "Session (5h)", 99)],
					}),
				),
			],
		});
		enable(h.engine);
		await h.engine.tick();
		expect(h.engine.status().claude.exhausted).toBe(true);

		h.advance(MINUTE);
		const result = await h.engine.switchManually("claude", "/profiles/b");

		expect(result.ok).toBe(true);
		const status = h.engine.status().claude;
		expect(status.enabled).toBe(true);
		expect(status.exhausted).toBe(false);
		expect(status.activeAccountId).toBe("acct-b");
		expect(status.cooldownUntil).toBe(T0 + MINUTE + 5 * MINUTE);
		expect(h.switched.at(-1)?.reasonKind).toBe("manual");
	});

	it("switches Codex by pointer alone and moves its sessions", async () => {
		const codex = (over: Partial<UsageAccount>) =>
			usageAccount({ agent: "codex", ...over });
		const h = harness({
			entries: [
				entryFor(
					codex({
						isDefault: true,
						selection: "/codex/a",
						windows: [w("primary", "5h", 95)],
					}),
				),
				entryFor(
					codex({
						accountKey: "key-b",
						accountId: "acct-b",
						selection: "/codex/b",
						windows: [w("primary", "5h", 10)],
					}),
				),
			],
			sessions: [movableSession({ agent: "codex", configDir: "/codex/a" })],
		});
		enable(h.engine, "codex");

		await h.engine.tick();

		expect(h.calls).not.toContain("swap");
		expect(h.pointers).toEqual([{ agent: "codex", selection: "/codex/b" }]);
		expect(h.moved[0]?.agent).toBe("codex");
	});

	it("refuses to enable auto-switch on Windows", () => {
		const h = harness({ platform: "win32" });

		const result = h.engine.setSettings("claude", { enabled: true });

		expect(result).toEqual({
			ok: false,
			code: "unsupported-platform",
			reason:
				"Automatic account switching is not supported on Windows: the launch wrapper that re-resolves the account pointer is POSIX shell.",
		});
		expect(h.engine.status().claude.platformSupported).toBe(false);
	});

	it("rejects settings outside their documented ranges", () => {
		const h = harness();
		expect(h.engine.setSettings("claude", { thresholdPercent: 0 }).ok).toBe(
			false,
		);
		expect(h.engine.setSettings("claude", { cooldownSeconds: -1 }).ok).toBe(
			false,
		);
		expect(h.engine.setSettings("claude", { thresholdPercent: 80 }).ok).toBe(
			true,
		);
		expect(h.engine.getSettings().claude.thresholdPercent).toBe(80);
	});

	it("persists rotation flags for the decision to read", () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);
		h.engine.setRotation("acct-b", false);

		expect(h.engineState.readRotation()).toEqual({ "acct-b": false });
	});

	it("holds a candidate out of rotation back", async () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);
		h.engine.setRotation("acct-b", false);

		await h.engine.tick();

		expect(h.calls).not.toContain("swap");
		expect(h.engine.status().claude.exhausted).toBe(true);
	});

	it("re-asserts the identity block a running Claude Code overwrote", async () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);
		await h.engine.tick();

		// The swap wrote B; the CLI rewrote .claude.json from memory with A's
		// identity while the credential it holds is still the one we wrote.
		h.setActiveIdentity({ accountUuid: "acct-a", credentialHash: "swapped" });
		h.advance(MINUTE);
		await h.engine.tick();

		expect(h.identityWrites).toEqual([join(ACTIVE_DIR, ".claude.json")]);
		expect(h.engine.status().claude.activeAccountId).toBe("acct-b");
	});

	it("adopts an external login change as the active account", async () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);
		await h.engine.tick();

		h.setActiveIdentity({
			accountUuid: "acct-a",
			credentialHash: "someone-else",
		});
		h.advance(MINUTE);
		await h.engine.tick();

		expect(h.identityWrites).toEqual([]);
		expect(h.engine.status().claude.activeAccountId).toBe("acct-a");
		expect(h.switched.at(-1)?.reasonKind).toBe("external");
	});

	// KTD5/R2: auto-switch is off on a fresh install, and the lock is what
	// lets this instance act on the user's own commands at all.
	it("claims the lock with every agent's auto-switch off", async () => {
		const h = harness({ entries: twoClaudeAccounts() });

		await h.engine.tick();

		expect(h.engine.status().claude.lockOwner).toBe(true);
		expect(h.engine.status().codex.lockOwner).toBe(true);
		expect(h.calls).not.toContain("swap");

		const result = await h.engine.switchManually("claude", "/profiles/b");
		expect(result.ok).toBe(true);
		expect(h.engine.status().claude.activeAccountId).toBe("acct-b");
	});

	it("owns the lock from start(), not a tick later", () => {
		const h = harness();

		h.engine.start();

		expect(h.engine.status().claude.lockOwner).toBe(true);
		h.engine.stop();
		expect(h.engine.status().claude.lockOwner).toBe(false);
	});

	it("keeps the lock across a tick that has nothing to decide", async () => {
		const owner = harness();
		await owner.engine.tick();
		expect(owner.engine.status().claude.lockOwner).toBe(true);

		const second = harness();
		await second.engine.tick();

		expect(second.engine.status().claude.lockOwner).toBe(false);
		expect(owner.engine.status().claude.lockOwner).toBe(true);
	});

	it("refuses a manual switch once the lock is lost", async () => {
		const owner = harness({ entries: twoClaudeAccounts() });
		await owner.engine.tick();

		const loser = harness({ entries: twoClaudeAccounts() });
		const result = await loser.engine.switchManually("claude", "/profiles/b");

		expect(result).toEqual({
			ok: false,
			code: "lock-loser",
			reason:
				"Another Superset instance on this machine owns account switching.",
		});
		expect(loser.calls).not.toContain("swap");
	});

	// KTD4: the quota store never sets isDefault — the Usage query decorates a
	// copy — so the pointer is what says which login sessions are on.
	it("seeds the active account from the host pointer", async () => {
		// B has the most headroom, so no proactive move competes with the
		// question under test.
		const calmPair = () => [
			entryFor(usageAccount({ windows: [w("five_hour", "Session (5h)", 30)] })),
			entryFor(
				usageAccount({
					accountKey: "key-b",
					accountId: "acct-b",
					selection: "/profiles/b",
					windows: [w("five_hour", "Session (5h)", 10)],
				}),
			),
		];
		const h = harness({
			entries: calmPair(),
			pointer: { claudeConfigDir: "/profiles/b" },
		});
		// The active dir holds B's login, which is what the pointer names.
		h.setActiveIdentity({ accountUuid: "acct-b", credentialHash: "hash-b" });
		enable(h.engine);

		await h.engine.tick();

		expect(h.engine.status().claude.activeAccountId).toBe("acct-b");
		expect(h.calls).not.toContain("swap");
	});

	it("reads a null pointer as the system-default login", async () => {
		const h = harness({
			entries: [
				entryFor(
					usageAccount({
						accountKey: "key-default",
						accountId: "acct-default",
						selection: null,
						windows: [w("five_hour", "Session (5h)", 10)],
					}),
				),
				entryFor(
					usageAccount({
						accountKey: "key-b",
						accountId: "acct-b",
						selection: "/profiles/b",
						windows: [w("five_hour", "Session (5h)", 20)],
					}),
				),
			],
			pointer: { claudeConfigDir: null },
		});
		h.setActiveIdentity({
			accountUuid: "acct-default",
			credentialHash: "hash-default",
		});
		enable(h.engine);

		await h.engine.tick();

		expect(h.engine.status().claude.activeAccountId).toBe("acct-default");
	});

	// R16: the renderer and the router both file the toggle under
	// `${agent}:${accountId}`, so the decision has to read it there.
	it("holds a candidate out of rotation under the router's own key", async () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);
		h.engine.setRotation("claude:acct-b", false);

		await h.engine.tick();

		expect(h.calls).not.toContain("swap");
		expect(h.engine.status().claude.exhausted).toBe(true);
	});

	it("never swaps on a lock loser and moves its sessions on an external switch", async () => {
		const calm = () => [
			entryFor(
				usageAccount({
					isDefault: true,
					windows: [w("five_hour", "Session (5h)", 10)],
				}),
			),
		];
		const owner = harness({ entries: calm() });
		enable(owner.engine);
		await owner.engine.tick();
		expect(owner.engine.status().claude.lockOwner).toBe(true);

		const loser = harness({ entries: calm() });
		await loser.engine.tick();
		expect(loser.engine.status().claude.lockOwner).toBe(false);
		expect(loser.calls).not.toContain("refreshDue");
		expect(loser.externalSwitches).toEqual([]);

		// The owner switches; the shared runtime.json is the loser's only
		// notice, because two org host-services share no event bus (KTD5).
		owner.setEntries(twoClaudeAccounts());
		owner.advance(10 * MINUTE);
		await owner.engine.tick();
		expect(owner.switched).toHaveLength(1);

		loser.advance(11 * MINUTE);
		await loser.engine.tick();

		expect(loser.externalSwitches).toEqual(["claude"]);
		expect(loser.calls).not.toContain("swap");
	});

	it("broadcasts a needs-attention state from the mover", () => {
		const h = harness();
		enable(h.engine);
		h.engineStates.length = 0;

		h.engine.reportNeedsAttention({
			agent: "claude",
			workspaceId: "ws-1",
			terminalId: "term-1",
			reason: "nudge-undeliverable",
		});

		expect(h.engineStates.at(-1)).toMatchObject({
			scope: "claude",
			agent: "claude",
			needsAttention: {
				workspaceId: "ws-1",
				terminalId: "term-1",
				reason: "nudge-undeliverable",
			},
		});
	});

	it("keeps token material out of the history file", async () => {
		const h = harness({ entries: twoClaudeAccounts() });
		enable(h.engine);
		await h.engine.tick();

		const raw = readFileSync(
			join(home, "state", "account-engine", "history.jsonl"),
			"utf8",
		);
		expect(raw).not.toMatch(/accessToken|refreshToken|sk-ant|eyJ/);
	});
});

describe("app wiring", () => {
	// The engine must not be constructed in a cloud sandbox (KTD1): a sandbox
	// holds one account and one workspace, and a second engine racing for the
	// host-wide lock would only fight the machine that owns it. `createApp`
	// needs a live database, a Hono server and a tRPC client to run at all, so
	// the invariant is asserted against the wiring itself.
	it("constructs the engine only outside sandbox mode", () => {
		const source = readFileSync(
			join(import.meta.dirname, "..", "app.ts"),
			"utf8",
		);
		const guard = 'if (process.env.SUPERSET_HOST_RUN_MODE !== "sandbox") {';
		const start = source.indexOf(guard);
		expect(start).toBeGreaterThan(-1);
		const end = source.indexOf("\n\t}\n", start);
		const guarded = source.slice(start, end);
		expect(guarded).toContain("new AccountEngine(");
		expect(source.split("new AccountEngine(")).toHaveLength(2);
	});
});
