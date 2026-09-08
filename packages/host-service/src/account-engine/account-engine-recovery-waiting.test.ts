import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../trpc/router/usage/types.ts";
import { AccountEngine } from "./account-engine.ts";
import {
	defaultAutoSwitchSettings,
	defaultEngineSettings,
	EngineState,
} from "./engine-state.ts";
import type { QuotaEntry } from "./quota-store.ts";
import type { MovableSession } from "./session-mover.ts";
import type { AccountAgent } from "./types.ts";

const T0 = 1_800_000_000_000;
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

function harness(agent: AccountAgent = "claude") {
	let now = T0;
	const state = new EngineState();
	state.writeSettings({
		...defaultEngineSettings(),
		[agent]: {
			...defaultAutoSwitchSettings(),
			enabled: true,
			modelWindows: [],
		},
	});
	const windows = (): UsageQuotaWindow[] =>
		agent === "codex"
			? [
					{
						id: "primary",
						label: "Session",
						usedPercent: 100,
						resetsAt: new Date(T0 + 60_000),
					},
				]
			: [
					{
						id: "five_hour",
						label: "Session",
						usedPercent: 10,
						resetsAt: null,
					},
					{
						id: "seven_day_sonnet",
						label: "Sonnet",
						usedPercent: 100,
						resetsAt: new Date(T0 + 60_000),
					},
					{
						id: "seven_day_opus",
						label: "Opus",
						usedPercent: 10,
						resetsAt: null,
					},
				];
	const entries = [
		entryFor(account({ agent, windows: windows(), isDefault: true })),
	];
	const stoppedRow: MovableSession = {
		agent,
		workspaceId: "workspace",
		terminalId: "waiting",
		managed: true,
		configDir: "/profiles/a",
		lastEventType: "Failed",
		lastEventAt: T0 - 1000,
		...(agent === "claude" ? { limitHintErrorType: "rate_limit" } : {}),
	};
	const rows: MovableSession[] = [stoppedRow];
	const restarted: string[] = [];
	const selected: Array<string | null> = [];
	let onRead: (() => void) | undefined;
	let restartSucceeds = true;
	const engine = new AccountEngine({
		engineState: state,
		machinePointers: {
			read: () => ({
				claudeConfigDir: "/profiles/a",
				codexHome: "/profiles/a",
			}),
			write: (_agent, selection) => {
				selected.push(selection);
			},
		},
		hostDeps: {
			listSessions: (forAgent) => rows.filter((row) => row.agent === forAgent),
			isAgentBusy: () => true,
			isTerminalAlive: () => true,
			killAndResume: async () => null,
			sendToTerminal: async () => {},
			snapshotTerminal: async () => null,
			hasStartedAgent: () => true,
			isBracketedPasteActive: () => false,
		},
		quotaStore: {
			entries: (forAgent) =>
				entries.filter(
					(entry) => forAgent === undefined || entry.agent === forAgent,
				),
			entry: (key) => entries.find((entry) => entry.key === key),
			read: async () => {
				for (const entry of entries) entry.fetchedAt = now;
				onRead?.();
				return [];
			},
			refreshDue: async () => {},
			setSnapshotSink: () => {},
			setSnapshotSource: () => {},
			snapshot: () => ({ entries: [] }),
		},
		mover: {
			observeLimitStop: async (row, quota) =>
				agent === "codex" && !quota.some((window) => window.usedPercent >= 100)
					? null
					: {
							model:
								agent === "codex"
									? null
									: row.terminalId === "waiting"
										? "Sonnet"
										: "Opus",
							source: "terminal",
						},
			fallbackRestart: async (row) => {
				restarted.push(row.terminalId);
				return restartSucceeds;
			},
			moveAtIdle: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
			onExternalSwitch: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
		},
		broadcast: { switched: () => {}, engineState: () => {} },
		now: () => now,
		platform: "linux",
		setBindingRecorder: () => {},
		readActiveIdentity: async () => ({
			accountUuid: null,
			credentialHash: null,
		}),
	});
	return {
		engine,
		state,
		rows,
		stoppedRow,
		restarted,
		selected,
		onRead(callback: () => void) {
			onRead = callback;
		},
		waiting: () => engine.status()[agent].waiting,
		pass: () => engine.handleLimitHints(now),
		advance(ms: number) {
			now += ms;
		},
		reset() {
			for (const entry of entries) {
				entry.fetchedAt = now;
				for (const account of entry.accounts)
					for (const window of account.windows) window.usedPercent = 10;
			}
		},
		dropModelWindow() {
			for (const entry of entries) {
				entry.fetchedAt = now;
				for (const account of entry.accounts) {
					account.windows = account.windows.filter(
						(window) => window.id !== "seven_day_sonnet",
					);
				}
			}
		},
		failRestart() {
			restartSucceeds = false;
		},
		succeedRestart() {
			restartSucceeds = true;
		},
		cooldown() {
			const runtime = state.readRuntime();
			runtime.perAgent[agent].cooldownUntil = now + 60_000;
			state.writeRuntime(runtime);
		},
	};
}

let home: string;
let previousHome: string | undefined;
beforeEach(() => {
	previousHome = process.env.SUPERSET_HOME_DIR;
	home = mkdtempSync(join(tmpdir(), "superset-recovery-waiting-"));
	process.env.SUPERSET_HOME_DIR = home;
});
afterEach(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(home, { recursive: true, force: true });
});

describe("pending limit recovery", () => {
	for (const agent of ["claude", "codex"] as const) {
		it(`does not restart ${agent} when a newer terminal event arrives during quota refresh`, async () => {
			const h = harness(agent);
			await h.pass();
			expect(h.waiting()).not.toBeNull();
			h.advance(16_000);
			let read = false;
			h.onRead(() => {
				read = true;
				h.reset();
				h.rows[0] = {
					...h.stoppedRow,
					lastEventAt: T0 + 16_000,
					lastEventType: "Start",
					limitHintErrorType: undefined,
				};
			});
			await h.pass();
			expect(read).toBe(true);
			expect(h.restarted).toEqual([]);
			expect(h.selected).toEqual([]);
			await h.pass();
			expect(h.waiting()).toBeNull();
			expect(h.restarted).toEqual([]);
		});
	}
	it("keeps waiting when the provider stops reporting the exhausted model window", async () => {
		const h = harness();
		await h.pass();
		expect(h.waiting()).not.toBeNull();
		h.dropModelWindow();
		await h.pass();
		expect(h.restarted).toEqual([]);
		expect(h.waiting()).not.toBeNull();
	});
	it("resumes a corroborated Codex waiter after quota resets below the observation gate", async () => {
		const h = harness("codex");
		await h.pass();
		expect(h.waiting()).not.toBeNull();
		h.reset();
		await h.pass();
		expect(h.restarted).toEqual(["waiting"]);
		expect(h.waiting()).toBeNull();
	});
	it("keeps a Claude waiter retryable while cooldown defers recovery", async () => {
		const h = harness();
		await h.pass();
		expect(h.waiting()).not.toBeNull();
		h.cooldown();
		await h.pass();
		expect(h.restarted).toEqual([]);
		h.advance(60_001);
		h.reset();
		await h.pass();
		expect(h.restarted).toEqual(["waiting"]);
		expect(h.waiting()).toBeNull();
	});
	it("does not restart another model's session or clear the original wait", async () => {
		const h = harness();
		await h.pass();
		const waiting = h.waiting();
		expect(waiting).not.toBeNull();
		h.rows.push({ ...h.stoppedRow, terminalId: "other" });
		await h.pass();
		expect(h.restarted).toEqual([]);
		expect(h.waiting()).toEqual(waiting);
	});
	for (const change of ["closed", "new-event"] as const) {
		it(`clears waiting when the terminal is ${change}`, async () => {
			const h = harness();
			await h.pass();
			expect(h.waiting()).not.toBeNull();
			if (change === "closed") h.rows.splice(0);
			else
				h.rows[0] = {
					...h.stoppedRow,
					lastEventAt: T0,
					limitHintErrorType: undefined,
					lastEventType: "Stop",
				};
			await h.pass();
			expect(h.waiting()).toBeNull();
			expect(h.restarted).toEqual([]);
		});
	}
	it("keeps failed reset recovery pending while its stopped terminal remains", async () => {
		const h = harness();
		await h.pass();
		h.reset();
		h.failRestart();
		await h.pass();
		expect(h.restarted).toEqual(["waiting"]);
		expect(h.waiting()).not.toBeNull();
		h.succeedRestart();
		await h.pass();
		expect(h.restarted).toEqual(["waiting"]);
		h.advance(defaultAutoSwitchSettings().cooldownSeconds * 1000 + 1);
		h.reset();
		await h.pass();
		expect(h.restarted).toEqual(["waiting", "waiting"]);
		expect(h.waiting()).toBeNull();
	});
});
