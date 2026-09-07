/**
 * The heartbeat behind `subscribeSessionMoverToStore`: a row deferred mid-turn
 * has to move even on a host whose store never emits again.
 */

import { describe, expect, it } from "bun:test";
import { TerminalAgentStore } from "../terminal-agents/index.ts";
import { subscribeSessionMoverToStore } from "./host-deps.ts";
import {
	type MovableSession,
	SessionMover,
	STALE_START_MS,
} from "./session-mover.ts";

const NOW = 1_700_000_000_000;

interface FakeTimers {
	setIntervalFn: typeof setInterval;
	clearIntervalFn: typeof clearInterval;
	/** The heartbeats currently scheduled, by handle. */
	live: Map<number, { delay: number; run: () => void }>;
}

function fakeTimers(): FakeTimers {
	const live = new Map<number, { delay: number; run: () => void }>();
	let nextHandle = 1;
	return {
		live,
		setIntervalFn: ((run: () => void, delay: number) => {
			const handle = nextHandle++;
			live.set(handle, { delay, run });
			return handle as unknown as ReturnType<typeof setInterval>;
		}) as unknown as typeof setInterval,
		clearIntervalFn: ((handle: number) => {
			live.delete(handle);
		}) as unknown as typeof clearInterval,
	};
}

/** A Codex row still parked on `Start` since `startedAt`. */
function busyCodexRow(startedAt: number): MovableSession {
	return {
		workspaceId: "ws-1",
		terminalId: "t1",
		agent: "codex",
		managed: true,
		configDir: "/profiles/a",
		lastEventType: "Start",
		lastEventAt: startedAt,
	};
}

function harness() {
	let clock = NOW;
	const killed: string[] = [];
	const rows = [busyCodexRow(NOW)];
	const mover = new SessionMover({
		listSessions: () => rows,
		isAgentBusy: () => true,
		isTerminalAlive: () => true,
		killAndResume: (input) => {
			killed.push(input.terminalId);
			return Promise.resolve({ terminalId: `${input.terminalId}-new` });
		},
		sendToTerminal: () => Promise.resolve(),
		snapshotTerminal: () => Promise.resolve(""),
		hasStartedAgent: () => true,
		isBracketedPasteActive: () => true,
		onNeedsAttention: () => {},
		now: () => clock,
	});
	return {
		mover,
		killed,
		advance: (ms: number) => {
			clock += ms;
		},
	};
}

describe("subscribeSessionMoverToStore heartbeat", () => {
	it("moves a deferred row on a host that emits no store change", async () => {
		const { mover, killed, advance } = harness();
		const store = new TerminalAgentStore();
		const timers = fakeTimers();
		const unsubscribe = subscribeSessionMoverToStore(store, mover, timers);

		// The switch reaches a mid-turn Codex row: deferred, not moved.
		const first = await mover.moveAtIdle("codex");
		expect(first.deferredTerminalIds).toEqual(["t1"]);
		expect(killed).toEqual([]);

		// Nothing else happens on this host — no binding write, no pane exit,
		// so no `change` event — but the row goes stale on `Start`.
		advance(STALE_START_MS + 60_000);
		expect(timers.live.size).toBe(1);
		for (const timer of timers.live.values()) {
			expect(timer.delay).toBe(60_000);
			timer.run();
		}
		await Promise.resolve();
		await Promise.resolve();

		expect(killed).toEqual(["t1"]);
		unsubscribe();
	});

	it("clears the heartbeat when the subscription is disposed", () => {
		const { mover } = harness();
		const store = new TerminalAgentStore();
		const timers = fakeTimers();

		const unsubscribe = subscribeSessionMoverToStore(store, mover, timers);
		expect(timers.live.size).toBe(1);

		unsubscribe();
		expect(timers.live.size).toBe(0);
		expect(store.listenerCount("change")).toBe(0);
	});
});
