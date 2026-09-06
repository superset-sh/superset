import { describe, expect, it } from "bun:test";
import type { UsageQuotaWindow } from "../trpc/router/usage/types.ts";
import {
	CONTINUE_NUDGE,
	type MovableSession,
	type NeedsAttentionEvent,
	SessionMover,
	type SessionMoverDeps,
	STALE_START_MS,
} from "./session-mover.ts";

const NOW = 1_700_000_000_000;

function row(overrides: Partial<MovableSession> = {}): MovableSession {
	return {
		workspaceId: "ws-1",
		terminalId: "t1",
		agent: "codex",
		managed: true,
		configDir: "/profiles/a",
		lastEventType: "Stop",
		lastEventAt: NOW - 1_000,
		...overrides,
	};
}

interface Harness {
	deps: SessionMoverDeps;
	mover: SessionMover;
	killCalls: Array<{
		workspaceId: string;
		terminalId: string;
		prompt?: string;
	}>;
	sendCalls: Array<{ workspaceId: string; terminalId: string; text: string }>;
	snapshotCalls: string[];
	attention: NeedsAttentionEvent[];
	timers: Array<{ delay: number; run: () => void }>;
	runTimers(): Promise<void>;
}

function harness(overrides: Partial<SessionMoverDeps> = {}): Harness {
	const killCalls: Harness["killCalls"] = [];
	const sendCalls: Harness["sendCalls"] = [];
	const snapshotCalls: string[] = [];
	const attention: NeedsAttentionEvent[] = [];
	const timers: Harness["timers"] = [];

	const deps: SessionMoverDeps = {
		listSessions: () => [],
		isAgentBusy: () => false,
		isTerminalAlive: () => true,
		killAndResume: (input) => {
			killCalls.push(input);
			return Promise.resolve({ terminalId: `${input.terminalId}-new` });
		},
		sendToTerminal: (input) => {
			sendCalls.push(input);
			return Promise.resolve();
		},
		snapshotTerminal: (terminalId) => {
			snapshotCalls.push(terminalId);
			return Promise.resolve("");
		},
		hasStartedAgent: () => true,
		isBracketedPasteActive: () => true,
		onNeedsAttention: (event) => attention.push(event),
		now: () => NOW,
		setTimeoutFn: ((run: () => void, delay: number) => {
			timers.push({ delay, run });
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown as typeof setTimeout,
		...overrides,
	};

	return {
		deps,
		mover: new SessionMover(deps),
		killCalls,
		sendCalls,
		snapshotCalls,
		attention,
		timers,
		async runTimers() {
			const due = timers.splice(0, timers.length);
			for (const timer of due) {
				timer.run();
				await Promise.resolve();
				await Promise.resolve();
				await Promise.resolve();
			}
		},
	};
}

const SPENT: UsageQuotaWindow[] = [
	{ id: "five_hour", label: "5-hour", usedPercent: 100, resetsAt: null },
];
// Codex's account-wide ids are its own: a Claude-shaped `five_hour` is out of
// scope for a Codex row and would prove nothing about that account.
const CODEX_SPENT: UsageQuotaWindow[] = [
	{ id: "primary", label: "5-hour", usedPercent: 100, resetsAt: null },
];
const CODEX_HEADROOM: UsageQuotaWindow[] = [
	{ id: "primary", label: "5-hour", usedPercent: 20, resetsAt: null },
];

describe("moveAtIdle", () => {
	it("restarts an idle Codex row once, and never a mid-turn one (AE2)", async () => {
		const busy = harness({ isAgentBusy: () => true });
		await busy.mover.moveAtIdle("codex", [row({ lastEventType: "Start" })]);
		expect(busy.killCalls).toEqual([]);

		// Once the turn ends the same row is restarted, with no prompt: the
		// planned move keeps the conversation, it does not talk to it. (A
		// second scan cannot double-restart: the resume path claims the
		// candidate atomically — see terminal-agents.test.ts.)
		const idle = harness();
		await idle.mover.moveAtIdle("codex", [row({ lastEventType: "Stop" })]);
		expect(idle.killCalls).toEqual([{ workspaceId: "ws-1", terminalId: "t1" }]);
	});

	it("never restarts a row parked on a permission request", async () => {
		const h = harness({ isAgentBusy: () => true });
		await h.mover.moveAtIdle("codex", [
			row({ lastEventType: "PermissionRequest", lastEventAt: 0 }),
		]);
		expect(h.killCalls).toEqual([]);
	});

	it("restarts a row stuck on Start past the staleness age (KTD9)", async () => {
		const h = harness({ isAgentBusy: () => true });
		await h.mover.moveAtIdle("codex", [
			row({
				lastEventType: "Start",
				lastEventAt: NOW - STALE_START_MS - 1,
			}),
		]);
		expect(h.killCalls).toHaveLength(1);
	});

	// KTD9 exists because Codex fires no hook when a turn dies in an error.
	// Claude's hooks do report Stop, so a Claude row 20 minutes into Start is a
	// long turn, and restarting it would throw that turn away.
	it("leaves a long Claude turn on Start alone, but not a stale Codex one", async () => {
		const stale = {
			lastEventType: "Start",
			lastEventAt: NOW - 20 * 60_000,
		} as const;

		const claude = harness({ isAgentBusy: () => true });
		await claude.mover.moveAtIdle("claude", [
			row({ agent: "claude", ...stale }),
		]);
		expect(claude.killCalls).toEqual([]);

		const codex = harness({ isAgentBusy: () => true });
		await codex.mover.moveAtIdle("codex", [row(stale)]);
		expect(codex.killCalls).toHaveLength(1);
	});

	// The row's event fields are a snapshot taken before the swap and before
	// every restart this pass has already done, so a session that is mid-turn
	// right now can still read as a stale `Start`. Busyness is resolved live;
	// staleness has to be too, or a live turn is killed as "no event for 15
	// minutes" and comes back with the conversation and no prompt.
	it("defers a Codex row the snapshot calls stale but that is live seconds ago", async () => {
		const h = harness({
			isAgentBusy: () => true,
			lastAgentEvent: () => ({ type: "Start", at: NOW - 2_000 }),
		});
		await h.mover.moveAtIdle("codex", [
			row({ lastEventType: "Start", lastEventAt: NOW - 20 * 60_000 }),
		]);
		expect(h.killCalls).toEqual([]);
	});

	it("defers a row live on a permission request under a stale snapshot", async () => {
		const h = harness({
			isAgentBusy: () => true,
			lastAgentEvent: () => ({ type: "PermissionRequest", at: NOW - 2_000 }),
		});
		await h.mover.moveAtIdle("codex", [
			row({ lastEventType: "Start", lastEventAt: NOW - 20 * 60_000 }),
		]);
		expect(h.killCalls).toEqual([]);
	});

	// The dep is optional so this layer stays self-contained: with no live
	// source wired up, the snapshot is still what decides.
	it("falls back to the snapshot when no live event source is wired", async () => {
		const stale = harness({ isAgentBusy: () => true });
		await stale.mover.moveAtIdle("codex", [
			row({ lastEventType: "Start", lastEventAt: NOW - 20 * 60_000 }),
		]);
		expect(stale.killCalls).toHaveLength(1);

		const fresh = harness({ isAgentBusy: () => true });
		await fresh.mover.moveAtIdle("codex", [
			row({ lastEventType: "Start", lastEventAt: NOW - 2_000 }),
		]);
		expect(fresh.killCalls).toEqual([]);
	});

	it("still moves a Codex row that is stale live as well as in the snapshot", async () => {
		const h = harness({
			isAgentBusy: () => true,
			lastAgentEvent: () => ({ type: "Start", at: NOW - STALE_START_MS - 1 }),
		});
		await h.mover.moveAtIdle("codex", [
			row({ lastEventType: "Start", lastEventAt: NOW - 20 * 60_000 }),
		]);
		expect(h.killCalls).toHaveLength(1);
	});

	it("never touches an unmanaged (user-exported) row", async () => {
		const h = harness();
		await h.mover.moveAtIdle("claude", [
			row({ agent: "claude", managed: false }),
		]);
		expect(h.killCalls).toEqual([]);
	});

	it("re-scans deferred rows when the store reports a change", async () => {
		let busy = true;
		const h = harness({
			isAgentBusy: () => busy,
			listSessions: () => [row({ lastEventType: "Stop" })],
		});

		await h.mover.moveAtIdle("codex", [row({ lastEventType: "Start" })]);
		expect(h.killCalls).toEqual([]);

		busy = false;
		await h.mover.handleStoreChange("ws-1");
		expect(h.killCalls).toEqual([{ workspaceId: "ws-1", terminalId: "t1" }]);
	});

	// The deferral remembers which rows were mid-turn, not just the agent: a
	// re-scan would restart the sessions this switch already moved.
	it("restarts only the deferred row on the next store change, once", async () => {
		let busyTerminalId: string | null = "t2";
		const rows = [
			row({ terminalId: "t1", lastEventType: "Stop" }),
			row({ terminalId: "t2", lastEventType: "Start" }),
		];
		const h = harness({
			isAgentBusy: (terminalId) => terminalId === busyTerminalId,
			listSessions: () => rows,
		});

		const result = await h.mover.moveAtIdle("codex", rows);
		expect(result).toEqual({
			movedTerminalIds: ["t1"],
			deferredTerminalIds: ["t2"],
		});

		busyTerminalId = null;
		await h.mover.handleStoreChange("ws-1");
		expect(h.killCalls.map((call) => call.terminalId)).toEqual(["t1", "t2"]);

		// Nothing is waiting any more, so a later change restarts nothing.
		await h.mover.handleStoreChange("ws-1");
		expect(h.killCalls.map((call) => call.terminalId)).toEqual(["t1", "t2"]);
	});

	// Callers hand in a pre-filtered list, and after the first switch an
	// unpinned row re-resolves to the active dir and drops out of it — so a
	// later pass routinely sees an empty list. Replacing the whole set then
	// forgot the row deferred mid-turn, and it kept running on the account the
	// engine had switched away from.
	it("keeps a deferral the next pass never looked at", async () => {
		let busy = true;
		const deferredRow = row({ terminalId: "t1", lastEventType: "Start" });
		const h = harness({
			isAgentBusy: () => busy,
			listSessions: () => [row({ terminalId: "t1", lastEventType: "Stop" })],
		});

		await h.mover.moveAtIdle("codex", [deferredRow]);
		expect(h.killCalls).toEqual([]);

		// A second switch whose filtered list no longer contains t1.
		await h.mover.moveAtIdle("codex", []);

		busy = false;
		await h.mover.handleStoreChange("ws-1");
		expect(h.killCalls.map((call) => call.terminalId)).toEqual(["t1"]);
	});

	it("drops a deferred row that has since moved onto the new account", async () => {
		let busy = true;
		const h = harness({
			isAgentBusy: () => busy,
			// A row that really moved is gone from the list under its old id: the
			// restart ends its binding and the session comes back on a fresh
			// terminal.
			listSessions: () => [
				row({ terminalId: "t1-new", lastEventType: "Stop" }),
			],
		});

		await h.mover.moveAtIdle("codex", [
			row({ terminalId: "t1", lastEventType: "Start" }),
		]);
		busy = false;
		await h.mover.handleStoreChange("ws-1");

		expect(h.killCalls).toEqual([]);
	});

	// `configDir` is what a *new* launch would resolve to right now, so once the
	// switch has written the host pointer every listed row reads as the new dir
	// — including the ones still waiting for their turn to end.
	it("restarts a deferred row whose configDir now reads as the new account", async () => {
		let busy = true;
		const h = harness({
			isAgentBusy: () => busy,
			listSessions: () => [
				row({ lastEventType: "Stop", configDir: "/accounts/codex-active" }),
			],
		});

		await h.mover.moveAtIdle("codex", [
			row({ lastEventType: "Start", configDir: "/profiles/a" }),
		]);
		busy = false;
		await h.mover.handleStoreChange("ws-1");

		expect(h.killCalls).toEqual([{ workspaceId: "ws-1", terminalId: "t1" }]);
	});

	it("moves this host's own rows on an external switch, touching no swap", async () => {
		const h = harness({
			listSessions: (agent) => [row({ agent, lastEventType: "Stop" })],
		});
		await h.mover.onExternalSwitch("claude");
		expect(h.killCalls).toEqual([{ workspaceId: "ws-1", terminalId: "t1" }]);
		expect(Object.keys(h.deps)).not.toContain("swapClaudeLogin");
	});
});

describe("fallbackRestart", () => {
	it("hands Claude the nudge as its launch prompt, exactly once (AE3)", async () => {
		const h = harness();
		const claude = row({ agent: "claude", terminalId: "tc" });

		await h.mover.fallbackRestart(claude);

		expect(h.killCalls).toEqual([
			{ workspaceId: "ws-1", terminalId: "tc", prompt: CONTINUE_NUDGE },
		]);
		expect(h.sendCalls).toEqual([]);
		expect(h.attention).toEqual([]);
	});

	it("types the nudge to Codex only once every gate holds", async () => {
		const h = harness();
		await h.mover.fallbackRestart(row({ terminalId: "tx" }));

		expect(h.killCalls).toEqual([{ workspaceId: "ws-1", terminalId: "tx" }]);
		expect(h.sendCalls).toEqual([
			{ workspaceId: "ws-1", terminalId: "tx-new", text: CONTINUE_NUDGE },
		]);
	});

	it("sends nothing and asks for attention when Codex died to a shell prompt", async () => {
		const h = harness({ nudgeMaxAttempts: 1, hasStartedAgent: () => false });
		await h.mover.fallbackRestart(row({ terminalId: "tx" }));
		await h.runTimers();

		expect(h.sendCalls).toEqual([]);
		expect(h.attention).toEqual([
			{
				agent: "codex",
				workspaceId: "ws-1",
				terminalId: "tx-new",
				reason: "nudge-undeliverable",
			},
		]);
	});

	// The first attempt runs before the shell has even been handed
	// `codex resume`, so bracketed paste is necessarily off and that attempt is
	// always spent. Delivery has to wait for Codex's TUI, whenever it arrives.
	it("holds the nudge while bracketed paste is off, then delivers when it comes on", async () => {
		let bracketed = false;
		const h = harness({ isBracketedPasteActive: () => bracketed });

		await h.mover.fallbackRestart(row({ terminalId: "tx" }));
		expect(h.sendCalls).toEqual([]);
		expect(h.timers.map((timer) => timer.delay)).toEqual([2_000]);

		// Several polls go by with Codex still booting.
		await h.runTimers();
		await h.runTimers();
		expect(h.sendCalls).toEqual([]);
		expect(h.attention).toEqual([]);

		bracketed = true;
		await h.runTimers();
		expect(h.sendCalls).toEqual([
			{ workspaceId: "ws-1", terminalId: "tx-new", text: CONTINUE_NUDGE },
		]);
		expect(h.attention).toEqual([]);
	});

	it("gives up and asks for attention once the poll is exhausted", async () => {
		const h = harness({
			nudgeMaxAttempts: 2,
			sendToTerminal: () => Promise.reject(new Error("write failed")),
		});

		await h.mover.fallbackRestart(row({ terminalId: "tx" }));
		expect(h.timers).toHaveLength(1);
		await h.runTimers();
		expect(h.attention).toEqual([]);
		await h.runTimers();

		expect(h.timers).toHaveLength(0);
		expect(h.attention.map((event) => event.reason)).toEqual([
			"nudge-undeliverable",
		]);
	});

	it("asks for attention when the resume itself produced no terminal", async () => {
		const h = harness({ killAndResume: () => Promise.resolve(null) });
		await h.mover.fallbackRestart(row({ agent: "claude", terminalId: "tc" }));

		expect(h.attention).toEqual([
			{
				agent: "claude",
				workspaceId: "ws-1",
				terminalId: "tc",
				reason: "resume-failed",
			},
		]);
	});
});

describe("corroborateLimitStop", () => {
	it("snapshots the hinted Claude terminal and matches its limit text", async () => {
		const h = harness({
			snapshotTerminal: () =>
				Promise.resolve("You've hit your 5-hour limit · resets 3:45pm"),
		});

		const corroborated = await h.mover.corroborateLimitStop(
			row({ agent: "claude", limitHintErrorType: "rate_limit" }),
			SPENT,
		);
		expect(corroborated).toBe(true);
	});

	// The caller has to hand over windows the agent is actually scored on: a
	// window whose id is neither account-wide nor a configured model is out of
	// scope, so a stand-in id would silently strand every limit-stopped
	// session instead of moving it.
	it("scores a Claude row only on windows in scope", async () => {
		const hinted = row({ agent: "claude", limitHintErrorType: "rate_limit" });
		const limitScreen = () =>
			Promise.resolve("You've hit your 5-hour limit · resets 3:45pm");

		const outOfScope = harness({ snapshotTerminal: limitScreen });
		expect(
			await outOfScope.mover.corroborateLimitStop(hinted, [
				{
					id: "limit-hint",
					label: "limit hint",
					usedPercent: 100,
					resetsAt: null,
				},
			]),
		).toBe(false);

		const accountWide = harness({ snapshotTerminal: limitScreen });
		expect(await accountWide.mover.corroborateLimitStop(hinted, SPENT)).toBe(
			true,
		);
	});

	it("scores a spent model window only once the user configured it", async () => {
		const hinted = row({ agent: "claude", limitHintErrorType: "rate_limit" });
		const limitScreen = () =>
			Promise.resolve("You've hit your 5-hour limit · resets 3:45pm");
		const windows: UsageQuotaWindow[] = [
			{ id: "five_hour", label: "5-hour", usedPercent: 20, resetsAt: null },
			{
				id: "weekly_scoped:Opus 4.5",
				label: "Weekly (Opus 4.5)",
				usedPercent: 100,
				resetsAt: null,
			},
		];

		const unconfigured = harness({ snapshotTerminal: limitScreen });
		expect(await unconfigured.mover.corroborateLimitStop(hinted, windows)).toBe(
			false,
		);

		const configured = harness({ snapshotTerminal: limitScreen });
		expect(
			await configured.mover.corroborateLimitStop(hinted, windows, [
				"Opus 4.5",
			]),
		).toBe(true);
	});

	it("never snapshots an unhinted Claude row", async () => {
		const h = harness();
		expect(
			await h.mover.corroborateLimitStop(row({ agent: "claude" }), SPENT),
		).toBe(false);
		expect(h.snapshotCalls).toEqual([]);
	});

	it("snapshots a busy Codex row only while its window is spent", async () => {
		const snapshotted: string[] = [];
		const spent = harness({
			isAgentBusy: () => true,
			snapshotTerminal: (terminalId) => {
				snapshotted.push(terminalId);
				return Promise.resolve("You've hit your usage limit.");
			},
		});
		expect(await spent.mover.corroborateLimitStop(row(), CODEX_SPENT)).toBe(
			true,
		);
		expect(snapshotted).toEqual(["t1"]);

		const belowCeiling = harness({ isAgentBusy: () => true });
		expect(
			await belowCeiling.mover.corroborateLimitStop(row(), CODEX_HEADROOM),
		).toBe(false);
		expect(belowCeiling.snapshotCalls).toEqual([]);

		const notBusy = harness({ isAgentBusy: () => false });
		expect(await notBusy.mover.corroborateLimitStop(row(), CODEX_SPENT)).toBe(
			false,
		);
		expect(notBusy.snapshotCalls).toEqual([]);
	});

	it("logs no screen text for an unmatched snapshot with the debug flag off", async () => {
		const secret = "sk-ant-not-a-limit-message";
		const h = harness({
			snapshotTerminal: () => Promise.resolve(secret),
		});
		const logged: string[] = [];
		const original = {
			log: console.log,
			warn: console.warn,
			error: console.error,
			debug: console.debug,
		};
		for (const level of ["log", "warn", "error", "debug"] as const) {
			console[level] = (...args: unknown[]) => {
				logged.push(args.map(String).join(" "));
			};
		}
		const previousFlag = process.env.SUPERSET_DEBUG_HOOKS;
		delete process.env.SUPERSET_DEBUG_HOOKS;
		try {
			expect(
				await h.mover.corroborateLimitStop(
					row({ agent: "claude", limitHintErrorType: "rate_limit" }),
					SPENT,
				),
			).toBe(false);
		} finally {
			Object.assign(console, original);
			if (previousFlag === undefined) {
				delete process.env.SUPERSET_DEBUG_HOOKS;
			} else {
				process.env.SUPERSET_DEBUG_HOOKS = previousFlag;
			}
		}

		expect(logged.join("\n")).not.toContain(secret);
	});
});
