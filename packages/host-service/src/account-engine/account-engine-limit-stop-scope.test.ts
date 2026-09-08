/** Model-scoped recovery acceptance cases with a normalized provider observation. */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../trpc/router/usage/types.ts";
import { AccountEngine } from "./account-engine.ts";
import type { ClaudeSwapResult } from "./claude-login-swap.ts";
import {
	defaultAutoSwitchSettings,
	defaultEngineSettings,
	EngineState,
} from "./engine-state.ts";
import type { AccountEngineHostDeps } from "./host-deps.ts";
import type { QuotaEntry } from "./quota-store.ts";
import type { MovableSession } from "./session-mover.ts";
import type { AccountAgent } from "./types.ts";

const T0 = 1_800_000_000_000;
const ACTIVE_DIR = "/superset-home/accounts/claude-active";
/** Spent, but only for a model — evidence only if the user configured it. */
const SPENT_MODEL_WINDOW: UsageQuotaWindow[] = [
	{
		id: "weekly_scoped:gpt-5-codex",
		label: "Weekly",
		usedPercent: 100,
		resetsAt: null,
	},
];
const SWAPPED: ClaudeSwapResult = {
	ok: true,
	identity: { accountUuid: "claude-acct-b", emailAddress: null, keys: {} },
};

function account(over: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "a",
		accountId: "acct-a",
		sourceLabel: "~/.claude",
		email: "a@example.com",
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [],
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

function entryFor(item: UsageAccount): QuotaEntry {
	return {
		key: `${item.agent}:${item.selection ?? "default"}`,
		agent: item.agent,
		selection: item.selection,
		accounts: [item],
		fetchedAt: T0,
		nextPollAt: T0,
		backoffMs: 0,
		lastError: null,
		tokenState: item.status,
		fetchable: true,
		inflight: null,
	};
}

/** The spent active account, plus the account with room a switch can reach. */
function pool(agent: AccountAgent, spent: UsageQuotaWindow[]): QuotaEntry[] {
	const roomy: UsageQuotaWindow[] = [
		{
			id: agent === "claude" ? "five_hour" : "primary",
			label: "Session",
			usedPercent: 10,
			resetsAt: null,
		},
	];
	return [
		entryFor(
			account({ agent, windows: spent, isDefault: true, selection: "/dirs/a" }),
		),
		entryFor(
			account({
				agent,
				accountKey: "b",
				accountId: "acct-b",
				email: "b@example.com",
				selection: "/dirs/b",
				windows: roomy,
			}),
		),
	];
}

function hintSession(agent: AccountAgent): MovableSession {
	return {
		workspaceId: "ws-1",
		terminalId: "term-1",
		agent,
		managed: true,
		configDir: "/dirs/a",
		lastEventType: agent === "claude" ? "Failed" : "Stop",
		lastEventAt: T0 - 1000,
		// Claude's hint is the hook event; Codex's is the stall below.
		...(agent === "claude" ? { limitHintErrorType: "rate_limit" } : {}),
	};
}

interface Corroboration {
	windows: readonly UsageQuotaWindow[];
	modelWindows: readonly string[];
}

interface Harness {
	engine: AccountEngine;
	calls: Corroboration[];
}

function buildEngine(input: {
	agent: AccountAgent;
	entries: QuotaEntry[];
	modelWindows: string[];
	observedModel?: string | null;
}): Harness {
	const state = new EngineState();
	state.writeSettings({
		...defaultEngineSettings(),
		[input.agent]: {
			...defaultAutoSwitchSettings(),
			enabled: true,
			modelWindows: input.modelWindows,
		},
	});
	const calls: Corroboration[] = [];
	const engine = new AccountEngine({
		engineState: state,
		db: {} as HostDb,
		hostDeps: {
			listSessions: (forAgent) =>
				forAgent === input.agent ? [hintSession(input.agent)] : [],
			// KTD7: a busy Codex row is the hint it has no event for.
			isAgentBusy: () => true,
			isTerminalAlive: () => true,
			killAndResume: async () => null,
			sendToTerminal: async () => {},
			snapshotTerminal: async () => null,
			hasStartedAgent: () => true,
			isBracketedPasteActive: () => false,
		} satisfies AccountEngineHostDeps,
		quotaStore: {
			entries: (forAgent) =>
				input.entries.filter(
					(entry) => forAgent === undefined || entry.agent === forAgent,
				),
			entry: (key) => input.entries.find((entry) => entry.key === key),
			read: async () => [],
			refreshDue: async () => {},
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
			observeLimitStop: async (_row, windows) => {
				calls.push({ windows, modelWindows: input.modelWindows });
				return { model: input.observedModel ?? null, source: "terminal" };
			},
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
		swap: async () => SWAPPED,
		seed: async () => SWAPPED,
		ensureActiveDir: async () => ACTIVE_DIR,
		provisionCodex: async () => {},
		setPointer: () => {},
		readPointerSelections: () => ({
			claudeConfigDir: null,
			codexHome: null,
		}),
		updateClaudeStateFile: async () => {},
		setBindingRecorder: () => {},
		resolveActiveDir: () => ACTIVE_DIR,
		readActiveIdentity: async () => ({
			accountUuid: null,
			credentialHash: null,
		}),
		// The Codex home the switch targets is signed in as the expected account.
		readCodexIdentity: async (selection) =>
			selection === "/dirs/b" ? "acct-b" : "acct-a",
	});
	return { engine, calls };
}

describe("a limit stop through the engine's own corroboration call", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-scope-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("waits instead of restarting onto another Fable-exhausted account without configured models", async () => {
		const spent: UsageQuotaWindow[] = [
			{ id: "five_hour", label: "Session", usedPercent: 30, resetsAt: null },
			{ id: "seven_day", label: "Weekly", usedPercent: 30, resetsAt: null },
			{
				id: "weekly_scoped:Fable",
				label: "Fable",
				usedPercent: 100,
				resetsAt: new Date(T0 + 60_000),
			},
		];
		const entries = pool("claude", spent);
		const destination = entries[1]?.accounts[0];
		if (!destination) throw new Error("Missing destination fixture");
		destination.windows = spent;
		const h = buildEngine({
			agent: "claude",
			entries,
			modelWindows: [],
			observedModel: "Fable",
		});
		await h.engine.handleLimitHints(T0);
		expect(h.engine.history()).toEqual([]);
		expect(h.engine.status().claude.waiting).toEqual({
			model: "Fable",
			resetAt: T0 + 60_000,
		});
		// The same stopped turn remains retryable once the other account has room.
		destination.windows = spent.map((window) => ({
			...window,
			usedPercent: 10,
		}));
		await h.engine.handleLimitHints(T0);
		expect(h.engine.history().map((row) => row.toAccountId)).toEqual([
			"acct-b",
		]);
		expect(h.engine.status().claude.waiting).toBeNull();
	});

	it("switches after a Claude limit observation and confirmed destination quota", async () => {
		const h = buildEngine({
			agent: "claude",
			entries: pool("claude", [
				{
					id: "five_hour",
					label: "Session",
					usedPercent: 100,
					resetsAt: null,
				},
			]),
			modelWindows: ["Opus 4.6"],
		});

		await h.engine.handleLimitHints(T0);

		expect(h.calls).toHaveLength(1);
		// The configured models travel with the windows, or gate 3 scores by a
		// list the proactive path never agreed to.
		expect(h.calls[0]?.modelWindows).toEqual(["Opus 4.6"]);
		expect(h.engine.history().map((row) => row.reasonKind)).toEqual([
			"fallback",
		]);
	});

	it("corroborates a Codex stall on the account's own windows", async () => {
		const h = buildEngine({
			agent: "codex",
			entries: pool("codex", [
				{ id: "primary", label: "5h", usedPercent: 100, resetsAt: null },
			]),
			modelWindows: [],
		});

		await h.engine.handleLimitHints(T0);

		expect(h.calls[0]?.windows.map((window) => window.id)).toEqual(["primary"]);
		expect(h.engine.history().map((row) => row.reasonKind)).toEqual([
			"fallback",
		]);
	});

	it("waits on an unconfigured model when the target lacks that model quota", async () => {
		const h = buildEngine({
			agent: "codex",
			entries: pool("codex", SPENT_MODEL_WINDOW),
			modelWindows: [],
		});

		await h.engine.handleLimitHints(T0);

		expect(h.engine.history()).toEqual([]);
	});

	it("waits when an unconfigured Claude model has no confirmed destination quota", async () => {
		const h = buildEngine({
			agent: "claude",
			entries: pool("claude", [
				{ id: "five_hour", label: "Session", usedPercent: 30, resetsAt: null },
				{ id: "seven_day", label: "Weekly", usedPercent: 30, resetsAt: null },
				{
					id: "seven_day_opus",
					label: "Weekly (Opus)",
					usedPercent: 100,
					resetsAt: null,
				},
			]),
			modelWindows: [],
		});

		await h.engine.handleLimitHints(T0);

		expect(h.engine.history()).toEqual([]);
		expect(h.engine.status().claude.waiting).toEqual({
			model: null,
			resetAt: null,
		});
	});

	it("ranks the fallback's target the way the proactive path ranks it", async () => {
		// Every candidate here has room, so the only question is which one the
		// fallback lands on — and it has to be the one `shouldSwitch` would
		// pick from the same set. Both last resorts outscore the plan account
		// on raw headroom, so a bare `pickBest` takes one of them.
		const h = buildEngine({
			agent: "claude",
			entries: [
				entryFor(
					account({
						windows: [
							{
								id: "five_hour",
								label: "Session",
								usedPercent: 100,
								resetsAt: null,
							},
						],
						isDefault: true,
						selection: "/dirs/a",
					}),
				),
				// Scores a full 100 on nothing: its only window is scoped to a
				// model nobody configured.
				entryFor(
					account({
						accountKey: "b",
						accountId: "acct-b",
						email: "b@example.com",
						selection: "/dirs/b",
						windows: [
							{
								id: "seven_day_opus",
								label: "Weekly (Opus)",
								usedPercent: 5,
								resetsAt: null,
							},
						],
					}),
				),
				// Readable and nearly empty, but per-token billed.
				entryFor(
					account({
						accountKey: "c",
						accountId: "acct-c",
						email: "c@example.com",
						selection: "/dirs/c",
						credentialKind: "api_key",
						inRotation: true,
						windows: [
							{
								id: "five_hour",
								label: "Session",
								usedPercent: 10,
								resetsAt: null,
							},
						],
					}),
				),
				// The plan the user pays for, with real room left.
				entryFor(
					account({
						accountKey: "d",
						accountId: "acct-d",
						email: "d@example.com",
						selection: "/dirs/d",
						windows: [
							{
								id: "five_hour",
								label: "Session",
								usedPercent: 70,
								resetsAt: null,
							},
						],
					}),
				),
			],
			modelWindows: [],
		});

		await h.engine.handleLimitHints(T0);

		expect(h.engine.history().map((row) => row.toAccountId)).toEqual([
			"acct-d",
		]);
	});

	it("requires the target to report a configured model window too", async () => {
		const h = buildEngine({
			agent: "codex",
			entries: pool("codex", SPENT_MODEL_WINDOW),
			modelWindows: ["gpt-5-codex"],
		});

		await h.engine.handleLimitHints(T0);

		expect(h.engine.history()).toEqual([]);
		expect(h.engine.status().codex.waiting).not.toBeNull();
	});
});
