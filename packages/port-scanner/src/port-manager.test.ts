import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { DetectedPort } from "./types";

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

interface MockPortInfo {
	port: number;
	pid: number;
	address: string;
	processName: string;
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
let listeningPorts: MockPortInfo[] = [];

mock.module("./scanner", () => ({
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
			return listeningPorts;
		} finally {
			spy.inFlight--;
		}
	},
}));

const { PortManager } = await import("./port-manager");

const HINT_DEBOUNCE_MS = 500;
const PAST_DEBOUNCE_MS = HINT_DEBOUNCE_MS + 50;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const noopKill = async () => ({ success: true });

let manager: InstanceType<typeof PortManager>;

const pmInternals = () =>
	manager as unknown as {
		scanInterval: ReturnType<typeof setInterval> | null;
	};

function resetSpy(): void {
	spy.getProcessTree = 0;
	spy.getListeningPortsForPids = 0;
	spy.inFlight = 0;
	spy.maxInFlight = 0;
	spy.lastSignal = undefined;
	spy.aborted = 0;
	lsofDelayMs = 0;
	listeningPorts = [];
}

beforeEach(() => {
	resetSpy();
	manager = new PortManager({ killFn: noopKill });
});

afterEach(() => {
	manager.stopPeriodicScan();
});

describe("PortManager — #3372 lifecycle (interval runs only with sessions)", () => {
	it("forceScan is a no-op when no sessions are registered", async () => {
		await manager.forceScan();
		expect(spy.getProcessTree).toBe(0);
		expect(spy.getListeningPortsForPids).toBe(0);
	});

	it("first registered session starts the interval; last unregister stops it", () => {
		expect(pmInternals().scanInterval).toBeNull();

		manager.upsertSession("p1", "ws1", 1000);
		expect(pmInternals().scanInterval).not.toBeNull();

		manager.unregisterSession("p1");
		expect(pmInternals().scanInterval).toBeNull();
	});

	it("sessions with pid=null still control the interval", () => {
		manager.upsertSession("pd1", "ws1", null);
		expect(pmInternals().scanInterval).not.toBeNull();

		manager.unregisterSession("pd1");
		expect(pmInternals().scanInterval).toBeNull();
	});

	it("multiple sessions: interval stops only when all are gone", () => {
		manager.upsertSession("p1", "ws1", 1000);
		manager.upsertSession("pd1", "ws2", 2000);

		manager.unregisterSession("p1");
		expect(pmInternals().scanInterval).not.toBeNull();

		manager.unregisterSession("pd1");
		expect(pmInternals().scanInterval).toBeNull();
	});

	it("re-registering after idle restarts the interval", () => {
		manager.upsertSession("p1", "ws1", 1000);
		manager.unregisterSession("p1");
		expect(pmInternals().scanInterval).toBeNull();

		manager.upsertSession("p2", "ws1", 1001);
		expect(pmInternals().scanInterval).not.toBeNull();
	});

	it("session with pid=null is skipped during PID collection", async () => {
		manager.upsertSession("p1", "ws1", null);
		await manager.forceScan();
		// No PID → no process-tree walk and no lsof batch.
		expect(spy.getProcessTree).toBe(0);
		expect(spy.getListeningPortsForPids).toBe(0);
	});
});

describe("PortManager — #3372 concurrency (at most one lsof in flight)", () => {
	it("bulk scan batches every session into a single lsof call", async () => {
		for (let i = 0; i < 10; i++) {
			manager.upsertSession(`p${i}`, `ws${i}`, 1000 + i);
		}
		await manager.forceScan();

		expect(spy.getListeningPortsForPids).toBe(1);
		expect(spy.maxInFlight).toBe(1);
	});

	it("a flood of hints coalesces into one follow-up, never concurrent", async () => {
		lsofDelayMs = 30;
		manager.upsertSession("p1", "ws1", 1000);

		const firstScan = manager.forceScan();

		// 100 hints while the first scan is running — all on the hot path.
		for (let i = 0; i < 100; i++) {
			manager.checkOutputForHint("listening on port 3000\n");
		}

		await firstScan;
		await sleep(PAST_DEBOUNCE_MS); // let the single debounced follow-up run

		expect(spy.maxInFlight).toBe(1);
		// Exact — one initial scan + one coalesced follow-up, never more, never fewer.
		expect(spy.getListeningPortsForPids).toBe(2);
	});
});

describe("PortManager — port identity updates", () => {
	it("emits an update when an existing port rebinds to a new address", async () => {
		const added: DetectedPort[] = [];
		const removed: DetectedPort[] = [];
		manager.on("port:add", (port: DetectedPort) => added.push(port));
		manager.on("port:remove", (port: DetectedPort) => removed.push(port));

		manager.upsertSession("p1", "ws1", 1000);

		listeningPorts = [
			{ port: 3000, pid: 1000, address: "0.0.0.0", processName: "node" },
		];
		await manager.forceScan();

		listeningPorts = [
			{ port: 3000, pid: 1000, address: "127.0.0.1", processName: "node" },
		];
		await manager.forceScan();

		const [port] = manager.getAllPorts();
		expect(port?.address).toBe("127.0.0.1");
		expect(added.map((event) => event.address)).toEqual([
			"0.0.0.0",
			"127.0.0.1",
		]);
		expect(removed.map((event) => event.address)).toEqual(["0.0.0.0"]);
	});

	it("dedupes dual-address listeners for the same terminal port", async () => {
		const added: DetectedPort[] = [];
		const removed: DetectedPort[] = [];
		manager.on("port:add", (port: DetectedPort) => added.push(port));
		manager.on("port:remove", (port: DetectedPort) => removed.push(port));

		manager.upsertSession("p1", "ws1", 1000);

		listeningPorts = [
			{ port: 3000, pid: 1000, address: "::1", processName: "node" },
			{ port: 3000, pid: 1000, address: "127.0.0.1", processName: "node" },
		];
		await manager.forceScan();

		expect(manager.getAllPorts()).toHaveLength(1);
		expect(manager.getAllPorts()[0]?.address).toBe("127.0.0.1");
		expect(added).toHaveLength(1);
		expect(removed).toHaveLength(0);

		listeningPorts = [
			{ port: 3000, pid: 1000, address: "127.0.0.1", processName: "node" },
			{ port: 3000, pid: 1000, address: "::1", processName: "node" },
		];
		await manager.forceScan();

		expect(manager.getAllPorts()).toHaveLength(1);
		expect(manager.getAllPorts()[0]?.address).toBe("127.0.0.1");
		expect(added).toHaveLength(1);
		expect(removed).toHaveLength(0);
	});

	it("ranks expanded IPv6 loopback the same as ::1 when deduping", async () => {
		manager.upsertSession("p1", "ws1", 1000);

		listeningPorts = [
			{
				port: 3000,
				pid: 1000,
				address: "0:0:0:0:0:0:0:1",
				processName: "node",
			},
			{ port: 3000, pid: 1000, address: "0.0.0.0", processName: "node" },
		];
		await manager.forceScan();

		expect(manager.getAllPorts()).toHaveLength(1);
		expect(manager.getAllPorts()[0]?.address).toBe("0.0.0.0");
	});
});

describe("PortManager — #3372 hint regex narrowing", () => {
	beforeEach(() => {
		manager.upsertSession("p1", "ws1", 1000);
		resetSpy();
	});

	it("does NOT scan on a bare 'port 22' (old loose pattern)", async () => {
		manager.checkOutputForHint("connection reached port 22\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(0);
	});

	it("does NOT scan on a trailing ':12345' (old loose pattern)", async () => {
		manager.checkOutputForHint("commit abc123def:12345\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(0);
	});

	it("DOES scan on 'listening on port 3000'", async () => {
		manager.checkOutputForHint("listening on port 3000\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(1);
	});

	it("DOES scan on 'server running at http://localhost:3000'", async () => {
		manager.checkOutputForHint("server running at http://localhost:3000\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(1);
	});

	it("DOES scan on 'ready on http://localhost:5173' (Vite-style)", async () => {
		manager.checkOutputForHint("ready on http://localhost:5173\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(1);
	});

	it("DOES scan on Vite's 'Local:  http://localhost:5173/' banner", async () => {
		manager.checkOutputForHint("  ➜  Local:   http://localhost:5173/\n");
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(1);
	});

	it("DOES scan on Django's 'Starting development server at http://...'", async () => {
		manager.checkOutputForHint(
			"Starting development server at http://127.0.0.1:8000/\n",
		);
		await sleep(PAST_DEBOUNCE_MS);
		expect(spy.getListeningPortsForPids).toBe(1);
	});
});

describe("PortManager — #3372 teardown (no orphan children)", () => {
	it("stopPeriodicScan aborts any in-flight lsof", async () => {
		lsofDelayMs = 200;
		manager.upsertSession("p1", "ws1", 1000);

		const scanPromise = manager.forceScan();
		// Wait for the lsof stub to start.
		await sleep(10);
		expect(spy.inFlight).toBe(1);

		manager.stopPeriodicScan();

		// The promise resolves (port-scanner swallows its own errors).
		await scanPromise;

		expect(spy.aborted).toBeGreaterThanOrEqual(1);
		expect(spy.inFlight).toBe(0);
	});

	it("in-flight lsof receives the AbortSignal from the manager", async () => {
		lsofDelayMs = 50;
		manager.upsertSession("p1", "ws1", 1000);

		const scanPromise = manager.forceScan();
		await sleep(10);

		expect(spy.lastSignal).toBeDefined();
		expect(spy.lastSignal?.aborted).toBe(false);

		await scanPromise;
	});

	it("hint timer that fires after stopPeriodicScan does not crash on missing scanAbort", async () => {
		// Regression: ensureScanAbort() lazy-allocates so a leftover hintScanTimeout
		// firing after an idle stop can still run a scan with a fresh AbortSignal,
		// rather than passing `undefined` and losing abortability.
		manager.upsertSession("p1", "ws1", 1000);

		manager.checkOutputForHint("listening on port 3000\n");
		// Unregister immediately — this triggers stopPeriodicScanIfIdle which
		// clears the hint timer. If any code path regresses and the timer
		// survives past abort-nulling, ensureScanAbort must still produce a
		// valid signal rather than throwing.
		manager.unregisterSession("p1");

		// Re-register and force a scan; must complete without error.
		manager.upsertSession("p2", "ws2", 2000);
		await manager.forceScan();
		expect(spy.getListeningPortsForPids).toBeGreaterThanOrEqual(1);
	});
});
