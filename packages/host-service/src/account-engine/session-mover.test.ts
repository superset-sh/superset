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
const HEADROOM: UsageQuotaWindow[] = [
	{ id: "five_hour", label: "5-hour", usedPercent: 20, resetsAt: null },
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

	it("drops a deferred row that has since moved onto the new account", async () => {
		let busy = true;
		const h = harness({
			isAgentBusy: () => busy,
			// It comes back idle, but on the dir the switch moved everything to.
			listSessions: () => [
				row({ lastEventType: "Stop", configDir: "/accounts/claude-active" }),
			],
		});

		await h.mover.moveAtIdle("codex", [
			row({ lastEventType: "Start", configDir: "/profiles/a" }),
		]);
		busy = false;
		await h.mover.handleStoreChange("ws-1");

		expect(h.killCalls).toEqual([]);
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
		const h = harness({ hasStartedAgent: () => false });
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

	it("holds the nudge while bracketed paste is off, then delivers on the retry", async () => {
		let bracketed = false;
		const h = harness({ isBracketedPasteActive: () => bracketed });

		await h.mover.fallbackRestart(row({ terminalId: "tx" }));
		expect(h.sendCalls).toEqual([]);
		expect(h.timers.map((timer) => timer.delay)).toEqual([30_000]);

		bracketed = true;
		await h.runTimers();
		expect(h.sendCalls).toEqual([
			{ workspaceId: "ws-1", terminalId: "tx-new", text: CONTINUE_NUDGE },
		]);
		expect(h.attention).toEqual([]);
	});

	it("retries a failed write exactly once, then gives up", async () => {
		let fail = true;
		const h = harness({
			sendToTerminal: () => {
				if (fail) {
					fail = false;
					return Promise.reject(new Error("write failed"));
				}
				return Promise.reject(new Error("write failed again"));
			},
		});

		await h.mover.fallbackRestart(row({ terminalId: "tx" }));
		expect(h.timers).toHaveLength(1);
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
		expect(await spent.mover.corroborateLimitStop(row(), SPENT)).toBe(true);
		expect(snapshotted).toEqual(["t1"]);

		const belowCeiling = harness({ isAgentBusy: () => true });
		expect(await belowCeiling.mover.corroborateLimitStop(row(), HEADROOM)).toBe(
			false,
		);
		expect(belowCeiling.snapshotCalls).toEqual([]);

		const notBusy = harness({ isAgentBusy: () => false });
		expect(await notBusy.mover.corroborateLimitStop(row(), SPENT)).toBe(false);
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
