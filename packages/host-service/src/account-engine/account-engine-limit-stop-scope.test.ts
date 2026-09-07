/**
 * KTD7 gate 3 through the engine's own call: the windows the engine hands the
 * mover have to survive `windowsInScope`, and the models the user configured
 * have to travel with them. Claude's hint is asked with a stand-in window, so
 * that window must be one of Claude's account-wide ids or every Claude limit
 * stop is scoped away to nothing and answers false. The mover here is a fake
 * running the real gate on exactly what the engine passed it.
 */

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
import { isCorroboratedLimitStop } from "./limit-stop.ts";
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
			// The real gate, on exactly what the engine handed over: the screen
			// matched, so the verdict is the window scope's alone.
			corroborateLimitStop: async (row, windows, modelWindows) => {
				calls.push({ windows, modelWindows });
				return isCorroboratedLimitStop({
					agent: row.agent,
					hint: true,
					snapshotMatch: true,
					windows,
					modelWindows,
				});
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

	it("corroborates a Claude hint on the stand-in window and switches", async () => {
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
		// A stand-in scoped away to nothing would strand this session forever.
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

	it("ignores a spent model window for a model nobody configured", async () => {
		const h = buildEngine({
			agent: "codex",
			entries: pool("codex", SPENT_MODEL_WINDOW),
			modelWindows: [],
		});

		await h.engine.handleLimitHints(T0);

		// The proactive path refuses to score this window, so the fallback
		// must refuse it too — nothing here says the account is spent.
		expect(h.engine.history()).toEqual([]);
	});

	it("ignores a spent Claude model window for a model nobody configured", async () => {
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

		// Claude's gate 2 is asked with the stand-in, so gate 3 is the only
		// place the account's real windows are judged — and it has to scope
		// them. Otherwise the switch is reasoned by a window at 30%.
		expect(h.engine.history().map((row) => row.reasonKind)).toEqual([
			"fallback-rejected",
		]);
	});

	it("acts on that same window once the user configured its model", async () => {
		const h = buildEngine({
			agent: "codex",
			entries: pool("codex", SPENT_MODEL_WINDOW),
			modelWindows: ["gpt-5-codex"],
		});

		await h.engine.handleLimitHints(T0);

		expect(h.engine.history().map((row) => row.reasonKind)).toEqual([
			"fallback",
		]);
	});
});
