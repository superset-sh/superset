// Tests for the DaemonSupervisor:
// - probeDaemonVersion (one-shot hello/hello-ack against an in-process
//   fake daemon — exercises the *real* probe code, not a parallel impl)
// - update-pending event debouncing on adoption
// - getUpdateStatus semantics
// - restart() race-await + circuit-clear semantics
//
// Telemetry events are emitted as structured `console.log` lines (per the
// host-service-migration plan, decision D2). We spy on console.log and
// filter for our component prefix.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ClientMessage,
	encodeFrame,
	FrameDecoder,
} from "@superset/pty-daemon/protocol";
import { DaemonSupervisor, probeDaemonVersion } from "./DaemonSupervisor.ts";

// Capture supervisor-emitted log events. We replace console.log for the
// duration of the test, then filter for our supervisor's component prefix.
const loggedEvents: { event: string; props: Record<string, unknown> }[] = [];
const realConsoleLog = console.log;

beforeEach(() => {
	loggedEvents.length = 0;
	console.log = (...args: unknown[]) => {
		// Try to parse the first arg as JSON — supervisor logs in JSON;
		// non-JSON lines (e.g. plain "[pty-daemon:...] adopted ...") fall
		// through silently.
		const first = args[0];
		if (typeof first === "string") {
			try {
				const parsed = JSON.parse(first) as Record<string, unknown>;
				if (parsed.component === "pty-daemon-supervisor") {
					const { event, ...props } = parsed;
					loggedEvents.push({ event: String(event), props });
					return;
				}
			} catch {
				// not JSON, fall through
			}
		}
		// keep one breadcrumb for debugging on test failure
		realConsoleLog(...args);
	};
});

afterEach(() => {
	console.log = realConsoleLog;
});

interface FakeDaemonOptions {
	respondWithVersion?: string;
	respondRaw?: Buffer;
	hangUpAfterHello?: boolean;
	respondWithWrongMessageFirst?: boolean;
	silent?: boolean;
}

async function startFakeDaemon(opts: FakeDaemonOptions): Promise<{
	socketPath: string;
	close: () => Promise<void>;
}> {
	const socketPath = path.join(
		os.tmpdir(),
		`fake-pty-daemon-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`,
	);
	const server = net.createServer((sock) => {
		const decoder = new FrameDecoder();
		sock.on("data", (chunk: Buffer) => {
			decoder.push(chunk);
			for (const decoded of decoder.drain()) {
				const msg = decoded.message as ClientMessage;
				if (msg.type !== "hello") continue;
				if (opts.silent) return;
				if (opts.hangUpAfterHello) {
					sock.end();
					return;
				}
				if (opts.respondRaw) {
					sock.write(opts.respondRaw);
					return;
				}
				if (opts.respondWithWrongMessageFirst) {
					sock.write(
						encodeFrame({
							type: "error",
							code: "EBOGUS",
							message: "test",
						}),
					);
					return;
				}
				if (opts.respondWithVersion) {
					sock.write(
						encodeFrame({
							type: "hello-ack",
							protocol: 1,
							daemonVersion: opts.respondWithVersion,
						}),
					);
					return;
				}
			}
		});
		sock.on("error", () => {});
	});
	await new Promise<void>((resolve) => server.listen(socketPath, resolve));
	return {
		socketPath,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
			}),
	};
}

describe("probeDaemonVersion", () => {
	test("returns daemonVersion on valid hello-ack", async () => {
		const fake = await startFakeDaemon({ respondWithVersion: "0.1.0" });
		try {
			expect(await probeDaemonVersion(fake.socketPath, 1500)).toBe("0.1.0");
		} finally {
			await fake.close();
		}
	});

	test("returns null when there is no listener on the socket path", async () => {
		const dead = path.join(
			os.tmpdir(),
			`nonexistent-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`,
		);
		expect(await probeDaemonVersion(dead, 500)).toBeNull();
	});

	test("returns null on probe timeout (silent daemon)", async () => {
		const fake = await startFakeDaemon({ silent: true });
		try {
			expect(await probeDaemonVersion(fake.socketPath, 200)).toBeNull();
		} finally {
			await fake.close();
		}
	});

	test("returns null when daemon hangs up before hello-ack", async () => {
		const fake = await startFakeDaemon({ hangUpAfterHello: true });
		try {
			expect(await probeDaemonVersion(fake.socketPath, 1500)).toBeNull();
		} finally {
			await fake.close();
		}
	});

	test("returns null on malformed/garbage response", async () => {
		const fake = await startFakeDaemon({
			respondRaw: Buffer.from([0x00, 0xff, 0xab, 0xcd]),
		});
		try {
			expect(await probeDaemonVersion(fake.socketPath, 800)).toBeNull();
		} finally {
			await fake.close();
		}
	});

	test("returns null when daemon sends a non-hello-ack message first", async () => {
		const fake = await startFakeDaemon({ respondWithWrongMessageFirst: true });
		try {
			expect(await probeDaemonVersion(fake.socketPath, 800)).toBeNull();
		} finally {
			await fake.close();
		}
	});

	test("does not leak sockets across many invocations", async () => {
		const fake = await startFakeDaemon({ respondWithVersion: "0.1.0" });
		try {
			for (let i = 0; i < 50; i++) {
				expect(await probeDaemonVersion(fake.socketPath, 1000)).toBe("0.1.0");
			}
		} finally {
			await fake.close();
		}
	});
});

describe("DaemonSupervisor.getUpdateStatus", () => {
	let sup: DaemonSupervisor;

	beforeEach(() => {
		sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
	});

	test("returns null when no instance is registered", () => {
		expect(sup.getUpdateStatus("org-no-such")).toBeNull();
	});

	test("reflects updatePending=false for fresh-spawned instances", () => {
		seedInstance(sup, "org-fresh", {
			runningVersion: "0.1.0",
			expectedVersion: "0.1.0",
			updatePending: false,
		});
		expect(sup.getUpdateStatus("org-fresh")).toEqual({
			pending: false,
			running: "0.1.0",
			expected: "0.1.0",
		});
	});

	test("reflects updatePending=true for stale-adopted instances", () => {
		seedInstance(sup, "org-stale", {
			runningVersion: "0.0.9",
			expectedVersion: "0.1.0",
			updatePending: true,
		});
		expect(sup.getUpdateStatus("org-stale")).toEqual({
			pending: true,
			running: "0.0.9",
			expected: "0.1.0",
		});
	});

	test("'unknown' running version surfaces but is never pending", () => {
		seedInstance(sup, "org-probe-failed", {
			runningVersion: "unknown",
			expectedVersion: "0.1.0",
			updatePending: false,
		});
		const status = sup.getUpdateStatus("org-probe-failed");
		expect(status?.pending).toBe(false);
		expect(status?.running).toBe("unknown");
	});
});

describe("update-pending event debounce", () => {
	let sup: DaemonSupervisor;

	beforeEach(() => {
		sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
	});

	test("logs once per (running,expected) pair", () => {
		const adopted = staleInstance("0.0.9");
		invokeMaybeFire(sup, "org", adopted);
		invokeMaybeFire(sup, "org", adopted);
		invokeMaybeFire(sup, "org", adopted);
		const updateLogs = loggedEvents.filter(
			(e) => e.event === "pty_daemon_update_pending",
		);
		expect(updateLogs).toHaveLength(1);
		expect(updateLogs[0]?.props).toMatchObject({
			organizationId: "org",
			runningVersion: "0.0.9",
			expectedVersion: "0.1.0",
		});
	});

	test("re-fires when the running version changes", () => {
		invokeMaybeFire(sup, "org", staleInstance("0.0.8"));
		invokeMaybeFire(sup, "org", staleInstance("0.0.9"));
		expect(
			loggedEvents.filter((e) => e.event === "pty_daemon_update_pending"),
		).toHaveLength(2);
	});

	test("clears debounce when an instance becomes non-pending", () => {
		invokeMaybeFire(sup, "org", staleInstance("0.0.9"));
		invokeMaybeFire(sup, "org", freshInstance());
		invokeMaybeFire(sup, "org", staleInstance("0.0.9"));
		expect(
			loggedEvents.filter((e) => e.event === "pty_daemon_update_pending"),
		).toHaveLength(2);
	});

	test("does not fire when updatePending is false", () => {
		invokeMaybeFire(sup, "org", freshInstance());
		expect(
			loggedEvents.filter((e) => e.event === "pty_daemon_update_pending"),
		).toHaveLength(0);
	});

	test("debounce is per-organization", () => {
		const stale = staleInstance("0.0.9");
		invokeMaybeFire(sup, "org-a", stale);
		invokeMaybeFire(sup, "org-b", stale);
		expect(
			loggedEvents.filter((e) => e.event === "pty_daemon_update_pending"),
		).toHaveLength(2);
	});
});

describe("DaemonSupervisor.restart", () => {
	let sup: DaemonSupervisor;

	beforeEach(() => {
		sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
		(sup as unknown as { stop: typeof sup.stop }).stop = mock(
			async () => {},
		) as typeof sup.stop;
		(sup as unknown as { ensure: typeof sup.ensure }).ensure = mock(async () =>
			freshInstance(),
		) as typeof sup.ensure;
	});

	test("logs pty_daemon_user_restart with previous-version context", async () => {
		seedInstance(sup, "org-restart", {
			runningVersion: "0.0.9",
			expectedVersion: "0.1.0",
			updatePending: true,
		});
		await sup.restart("org-restart");
		const restartLogs = loggedEvents.filter(
			(e) => e.event === "pty_daemon_user_restart",
		);
		expect(restartLogs).toHaveLength(1);
		expect(restartLogs[0]?.props).toMatchObject({
			organizationId: "org-restart",
			previousRunningVersion: "0.0.9",
			previousExpectedVersion: "0.1.0",
			previousUpdatePending: true,
			hadCircuitOpen: false,
		});
	});

	test("clears the crash circuit so the user can recover from a tripped breaker", async () => {
		(sup as unknown as { circuitOpen: Set<string> }).circuitOpen.add(
			"org-tripped",
		);
		(sup as unknown as { crashTimes: Map<string, number[]> }).crashTimes.set(
			"org-tripped",
			[1, 2, 3, 4],
		);

		await sup.restart("org-tripped");

		expect(sup.isCircuitOpen("org-tripped")).toBe(false);
		expect(
			(sup as unknown as { crashTimes: Map<string, number[]> }).crashTimes.get(
				"org-tripped",
			),
		).toBeUndefined();

		const restartLogs = loggedEvents.filter(
			(e) => e.event === "pty_daemon_user_restart",
		);
		expect(restartLogs[0]?.props).toMatchObject({ hadCircuitOpen: true });
	});

	test("awaits an in-flight pendingStart before stopping", async () => {
		let resolvePending: (value: unknown) => void = () => {};
		const pendingPromise = new Promise((resolve) => {
			resolvePending = resolve;
		});
		(
			sup as unknown as { pendingStarts: Map<string, Promise<unknown>> }
		).pendingStarts.set("org-racey", pendingPromise);

		const stopMock = (sup as unknown as { stop: ReturnType<typeof mock> }).stop;
		const restartPromise = sup.restart("org-racey");

		await new Promise((r) => setTimeout(r, 10));
		expect(stopMock).not.toHaveBeenCalled();

		resolvePending({});
		await restartPromise;
		expect(stopMock).toHaveBeenCalledTimes(1);
	});

	test("falls through cleanly if the pendingStart rejects", async () => {
		const failingPending = Promise.reject(new Error("spawn failed"));
		failingPending.catch(() => {});
		(
			sup as unknown as { pendingStarts: Map<string, Promise<unknown>> }
		).pendingStarts.set("org-failed-spawn", failingPending);

		await expect(sup.restart("org-failed-spawn")).resolves.toEqual({
			success: true,
		});
	});

	test("returns success only after ensure resolves", async () => {
		const ensureMock = mock(async () => freshInstance());
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;
		const result = await sup.restart("org-ok");
		expect(result).toEqual({ success: true });
		expect(ensureMock).toHaveBeenCalledTimes(1);
	});
});

// ---------------- helpers ----------------

interface SeededFields {
	runningVersion: string;
	expectedVersion: string;
	updatePending: boolean;
}

function seedInstance(
	sup: DaemonSupervisor,
	organizationId: string,
	fields: SeededFields,
): void {
	const instances = (sup as unknown as { instances: Map<string, unknown> })
		.instances;
	instances.set(organizationId, {
		pid: 9999,
		socketPath: "/tmp/seeded.sock",
		startedAt: Date.now(),
		...fields,
	});
}

function freshInstance() {
	return {
		pid: 1234,
		socketPath: "/tmp/fresh.sock",
		startedAt: Date.now(),
		runningVersion: "0.1.0",
		expectedVersion: "0.1.0",
		updatePending: false,
	};
}

function staleInstance(running: string) {
	return {
		pid: 1234,
		socketPath: "/tmp/stale.sock",
		startedAt: Date.now(),
		runningVersion: running,
		expectedVersion: "0.1.0",
		updatePending: true,
	};
}

function invokeMaybeFire(
	sup: DaemonSupervisor,
	organizationId: string,
	instance: ReturnType<typeof staleInstance>,
): void {
	(
		sup as unknown as {
			maybeFireUpdatePending: (id: string, inst: typeof instance) => void;
		}
	).maybeFireUpdatePending(organizationId, instance);
}
