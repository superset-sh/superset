import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TerminalSession } from "./types";

/**
 * Regression tests for #3372 ("excessive lsof spawning").
 *
 * Three behaviors the fix guarantees:
 *   1. No scans run when there are no registered sessions (lifecycle).
 *   2. At most one scan is in flight at any moment, even under a flood of
 *      hint-matching output (concurrency / coalescing).
 *   3. stopPeriodicScan aborts any in-flight child so it cannot outlive us
 *      (no orphan lsof).
 *
 * The hint regexes that previously matched routine log noise ("port 22",
 * trailing ":12345") must no longer trigger scans; the three "listening on …"
 * patterns still must.
 */

interface ScannerSpy {
	getProcessTree: number;
	getListeningPortsForPids: number;
	inFlight: number;
	maxInFlight: number;
	lastSignal: AbortSignal | undefined;
	aborted: number;
}

const spy: ScannerSpy = {
	getProcessTree: 0,
	getListeningPortsForPids: 0,
	inFlight: 0,
	maxInFlight: 0,
	lastSignal: undefined,
	aborted: 0,
};

let lsofDelayMs = 0;

mock.module("./port-scanner", () => ({
	getProcessTree: async (pid: number) => {
		spy.getProcessTree++;
		return [pid, pid + 1];
	},
	getListeningPortsForPids: async (_pids: number[], signal?: AbortSignal) => {
		spy.getListeningPortsForPids++;
		spy.inFlight++;
		spy.maxInFlight = Math.max(spy.maxInFlight, spy.inFlight);
		spy.lastSignal = signal;
		try {
			if (lsofDelayMs > 0) {
				// Match production: getListeningPortsLsof catches all errors and
				// returns []. If we get aborted we just resolve with [] early.
				await new Promise<void>((resolve) => {
					const timer = setTimeout(resolve, lsofDelayMs);
					signal?.addEventListener("abort", () => {
						clearTimeout(timer);
						spy.aborted++;
						resolve();
					});
				});
			}
			return [];
		} finally {
			spy.inFlight--;
		}
	},
}));

mock.module("../tree-kill", () => ({
	treeKillWithEscalation: async () => ({ success: true }),
}));

const { portManager } = await import("./port-manager");

const HINT_DEBOUNCE_MS = 500;
const PAST_DEBOUNCE_MS = HINT_DEBOUNCE_MS + 50;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const makeSession = (paneId: string, pid: number): TerminalSession =>
	({ paneId, isAlive: true, pty: { pid } }) as unknown as TerminalSession;

// biome-ignore lint/suspicious/noExplicitAny: reach into private singleton state
const pmInternals = () => portManager as any;

function resetSpy(): void {
	spy.getProcessTree = 0;
	spy.getListeningPortsForPids = 0;
	spy.inFlight = 0;
	spy.maxInFlight = 0;
	spy.lastSignal = undefined;
	spy.aborted = 0;
	lsofDelayMs = 0;
}

function resetManager(): void {
	const internals = pmInternals();
	for (const paneId of Array.from<string>(internals.sessions.keys())) {
		portManager.unregisterSession(paneId);
	}
	for (const paneId of Array.from<string>(internals.daemonSessions.keys())) {
		portManager.unregisterDaemonSession(paneId);
	}
	portManager.stopPeriodicScan();
}

beforeEach(() => {
	resetSpy();
	resetManager();
});

afterEach(() => {
	resetManager();
});

describe("PortManager — #3372 lifecycle (interval runs only with sessions)", () => {
	it("forceScan is a no-op when no sessions are registered", async () => {
		await portManager.forceScan();
		expect(spy.getProcessTree).toBe(0);
		expect(spy.getListeningPortsForPids).toBe(0);
	});

	it("first registered session starts the interval; last unregister stops it", () => {
		expect(pmInternals().scanInterval).toBeNull();

		portManager.registerSession(makeSession("p1", 1000), "ws1");
		expect(pmInternals().scanInterval).not.toBeNull();

		portManager.unregisterSession("p1");
		expect(pmInternals().scanInterval).toBeNull();
	});

	it("daemon sessions control the interval the same way", () => {
		portManager.upsertDaemonSession("pd1", "ws1", 2000);
		expect(pmInternals().scanInterval).not.toBeNull();

		portManager.unregisterDaemonSession("pd1");
		expect(pmInternals().scanInterval).toBeNull();
	});

	it("mixed session types: interval stops only when all are gone", () => {
		portManager.registerSession(makeSession("p1", 1000), "ws1");
		portManager.upsertDaemonSession("pd1", "ws2", 2000);

		portManager.unregisterSession("p1");
		expect(pmInternals().scanInterval).not.toBeNull();

		portManager.unregisterDaemonSession("pd1");
		expect(pmInternals().scanInterval).toBeNull();
	});

	it("re-registering after idle restarts the interval", () => {
		portManager.registerSession(makeSession("p1", 1000), "ws1");
		portManager.unregisterSession("p1");
		expect(pmInternals().scanInterval).toBeNull();

		portManager.registerSession(makeSession("p2", 1001), "ws1");
		expect(pmInternals().scanInterval).not.toBeNull();
	});
});

describe("PortManager — #3372 concurrency (at most one lsof in flight)", () => {
	it("bulk scan batches every session into a single lsof call", async () => {
		for (let i = 0; i < 10; i++) {
			portManager.registerSession(makeSession(`p${i}`, 1000 + i), `ws${i}`);
		}
		await portManager.forceScan();

		expect(spy.getListeningPortsForPids).toBe(1);
		expect(spy.maxInFlight).toBe(1);
	});

	it("a flood of hints coalesces into one follow-up, never concurrent", async () => {
		lsofDelayMs = 30;
		portManager.registerSession(makeSession("p1", 1000), "ws1");

		const firstScan = portManager.forceScan();

		// 100 hints while the first scan is running — all on the hot path.
		for (let i = 0; i < 100; i++) {
			portManager.checkOutputForHint("listening on port 3000\n");
		}

		await firstScan;
		await sleep(PAST_DEBOUNCE_MS); // let the single debounced follow-up run

		expect(spy.maxInFlight).toBe(1);
		// Exact — one initial scan + one coalesced follow-up, never more, never fewer.
		expect(spy.getListeningPortsForPids).toBe(2);
	});
});

describe("PortManager — #3372 hint regex narrowing", () => {
	beforeEach(() => {
		portManager.registerSession(makeSession("p1", 1000), "ws1");
		resetSpy();
	});

	it("does NOT scan on a bare 'port 22' (old loose pattern)", async () => {
		portManager.checkOutputForHint("connection reached port 22\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(0);
	});

	it("does NOT scan on a trailing ':12345' (old loose pattern)", async () => {
		portManager.checkOutputForHint("commit abc123def:12345\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(0);
	});

	it("DOES scan on 'listening on port 3000'", async () => {
		portManager.checkOutputForHint("listening on port 3000\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(1);
	});

	it("DOES scan on 'server running at http://localhost:3000'", async () => {
		portManager.checkOutputForHint("server running at http://localhost:3000\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(1);
	});

	it("DOES scan on 'ready on http://localhost:5173' (Vite-style)", async () => {
		portManager.checkOutputForHint("ready on http://localhost:5173\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(1);
	});
});

describe("PortManager — #3372 teardown (no orphan children)", () => {
	it("stopPeriodicScan aborts any in-flight lsof", async () => {
		lsofDelayMs = 200;
		portManager.registerSession(makeSession("p1", 1000), "ws1");

		const scanPromise = portManager.forceScan();
		// Wait for the lsof stub to start.
		await sleep(10);
		expect(spy.inFlight).toBe(1);

		portManager.stopPeriodicScan();

		// The promise resolves (port-scanner swallows its own errors).
		await scanPromise;

		expect(spy.aborted).toBeGreaterThanOrEqual(1);
		expect(spy.inFlight).toBe(0);
	});

	it("in-flight lsof receives the AbortSignal from the manager", async () => {
		lsofDelayMs = 50;
		portManager.registerSession(makeSession("p1", 1000), "ws1");

		const scanPromise = portManager.forceScan();
		await sleep(10);

		expect(spy.lastSignal).toBeDefined();
		expect(spy.lastSignal?.aborted).toBe(false);

		await scanPromise;
	});
});
