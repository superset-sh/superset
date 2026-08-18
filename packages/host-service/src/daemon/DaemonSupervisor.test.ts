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
import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ClientMessage,
	encodeFrame,
	FrameDecoder,
} from "@superset/pty-daemon/protocol";
import {
	DaemonSupervisor,
	probeDaemonVersion,
	ptyDaemonSocketPath,
	shouldKillStaleDaemonForDev,
} from "./DaemonSupervisor.ts";
import { readPtyDaemonManifest, writePtyDaemonManifest } from "./manifest.ts";

// Capture supervisor-emitted log events. We replace console.log for the
// duration of the test, then filter for our supervisor's component prefix.
const loggedEvents: { event: string; props: Record<string, unknown> }[] = [];
const realConsoleLog = console.log;

interface AdoptedForTest {
	pid: number;
	socketPath: string;
	runningVersion: string;
	updatePending: boolean;
}

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
	socketPath?: string;
	respondWithVersion?: string;
	daemonPid?: number;
	respondRaw?: Buffer;
	hangUpAfterHello?: boolean;
	respondWithWrongMessageFirst?: boolean;
	silent?: boolean;
}

async function startFakeDaemon(opts: FakeDaemonOptions): Promise<{
	socketPath: string;
	close: () => Promise<void>;
}> {
	const socketPath =
		opts.socketPath ??
		path.join(
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
							daemonPid: opts.daemonPid,
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

describe("shouldKillStaleDaemonForDev", () => {
	test("keeps production adoption behavior", () => {
		expect(shouldKillStaleDaemonForDev({ NODE_ENV: "production" })).toBe(false);
	});

	test("kills stale daemons only in explicit dev mode", () => {
		expect(shouldKillStaleDaemonForDev({ NODE_ENV: "development" })).toBe(true);
		expect(shouldKillStaleDaemonForDev({})).toBe(false);
	});

	test("allows production-like adoption in dev for handoff testing", () => {
		expect(
			shouldKillStaleDaemonForDev({
				NODE_ENV: "development",
				SUPERSET_PTY_DAEMON_ADOPT_IN_DEV: "1",
			}),
		).toBe(false);
	});
});

describe("DaemonSupervisor.tryAdopt", () => {
	let originalHome: string | undefined;
	let tmpHome: string;

	beforeEach(() => {
		originalHome = process.env.SUPERSET_HOME_DIR;
		tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pty-daemon-unit-"));
		process.env.SUPERSET_HOME_DIR = tmpHome;
	});

	afterEach(() => {
		if (originalHome !== undefined) {
			process.env.SUPERSET_HOME_DIR = originalHome;
		} else {
			delete process.env.SUPERSET_HOME_DIR;
		}
		fs.rmSync(tmpHome, { recursive: true, force: true });
	});

	test("recovers adoption from a live expected socket when the manifest is missing", async () => {
		const orgId = "org-socket-fallback";
		const socketPath = ptyDaemonSocketPath(orgId);
		try {
			try {
				fs.unlinkSync(socketPath);
			} catch {
				// best-effort cleanup from a failed prior run
			}
			const fake = await startFakeDaemon({
				socketPath,
				respondWithVersion: "0.1.0",
				daemonPid: process.pid,
			});
			try {
				const sup = new DaemonSupervisor({
					scriptPath: "/nonexistent",
					autoUpdate: false,
				});
				const adopted = (await invokeTryAdopt(
					sup,
					orgId,
				)) as AdoptedForTest | null;
				expect(adopted).not.toBeNull();
				expect(adopted?.pid).toBe(process.pid);
				expect(adopted?.socketPath).toBe(socketPath);
				expect(adopted?.runningVersion).toBe("0.1.0");
				expect(readPtyDaemonManifest(orgId)).toMatchObject({
					pid: process.pid,
					socketPath,
					organizationId: orgId,
				});
				expect(
					loggedEvents.some(
						(e) =>
							e.event === "pty_daemon_socket_adopt_manifest_recovered" &&
							e.props.sourceReason === "manifest_missing" &&
							e.props.pid === process.pid,
					),
				).toBe(true);
			} finally {
				await fake.close();
			}
		} finally {
			try {
				fs.unlinkSync(socketPath);
			} catch {
				// best-effort
			}
		}
	});

	test("adopts an unprobeable but pid-alive daemon instead of killing its shells", async () => {
		const orgId = "org-unprobeable";
		// Silent but listening: connects succeed, hello never answered —
		// a wedged/overloaded daemon, not a dead one.
		const fake = await startFakeDaemon({ silent: true });
		const childPid = spawnIdleChild();
		try {
			writePtyDaemonManifest({
				pid: childPid,
				socketPath: fake.socketPath,
				protocolVersions: [1],
				startedAt: Date.now(),
				organizationId: orgId,
			});

			const sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
			const adopted = (await invokeTryAdopt(
				sup,
				orgId,
			)) as AdoptedForTest | null;
			// Adopted, not rejected: the pid is alive so it still owns PTYs.
			expect(adopted).not.toBeNull();
			expect(adopted?.pid).toBe(childPid);
			expect(adopted?.runningVersion).toBe("unknown");
			// A failed probe must not be mistaken for version drift.
			expect(adopted?.updatePending).toBe(false);
			// The whole point of SUPER-833: the daemon is left running.
			expect(await waitForProcessExit(childPid, 1500)).toBe(false);
			expect(isProcessAliveForTest(childPid)).toBe(true);
		} finally {
			await fake.close();
			killIfAlive(childPid);
		}
	}, 15_000);

	test("adopts a pid-alive daemon that answers the probe without force-killing it", async () => {
		// Regression guard for SUPER-833: a reachable, probeable daemon that
		// owns live shells must be adopted, never terminated during adoption.
		const childPid = spawnIdleChild();
		const orgId = "org-healthy-adopt";
		const fake = await startFakeDaemon({
			respondWithVersion: "0.1.0",
			daemonPid: childPid,
		});
		try {
			writePtyDaemonManifest({
				pid: childPid,
				socketPath: fake.socketPath,
				protocolVersions: [2],
				startedAt: Date.now(),
				organizationId: orgId,
			});
			const sup = new DaemonSupervisor({
				scriptPath: "/nonexistent",
				autoUpdate: false,
			});
			const adopted = (await invokeTryAdopt(
				sup,
				orgId,
			)) as AdoptedForTest | null;
			expect(adopted).not.toBeNull();
			expect(adopted?.pid).toBe(childPid);
			expect(adopted?.runningVersion).toBe("0.1.0");
			// The live daemon must not have taken the destructive reject path.
			expect(
				loggedEvents.some((e) => e.event === "pty_daemon_adopt_rejected"),
			).toBe(false);
			expect(isProcessAliveForTest(childPid)).toBe(true);
		} finally {
			await fake.close();
			killIfAlive(childPid);
		}
	});

	test("refuses to adopt a recycled pid whose socket has no listener", async () => {
		// After a reboot the manifest's pid can belong to an unrelated live
		// process while the daemon (and its socket) are gone. Adopting it
		// would wedge terminals behind a phantom instance forever.
		const orgId = "org-recycled-pid";
		const childPid = spawnIdleChild();
		try {
			writePtyDaemonManifest({
				pid: childPid,
				socketPath: path.join(os.tmpdir(), `dead-${process.pid}.sock`),
				protocolVersions: [1],
				startedAt: Date.now(),
				organizationId: orgId,
			});

			const sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
			const adopted = await invokeTryAdopt(sup, orgId);
			// No listener anywhere → not adoptable; the caller spawns fresh.
			expect(adopted).toBeNull();
			// The stale manifest is gone so the next boot doesn't re-trip.
			expect(readPtyDaemonManifest(orgId)).toBeNull();
			expect(
				loggedEvents.some((e) => e.event === "pty_daemon_manifest_stale"),
			).toBe(true);
			// The unrelated process must never be signalled.
			expect(isProcessAliveForTest(childPid)).toBe(true);
		} finally {
			killIfAlive(childPid);
		}
	}, 15_000);

	test("falls back to the expected socket when the manifest socket is dead", async () => {
		// A stale manifest can point at a dead socket while a healthy daemon
		// answers at the expected path — adopt the healthy one.
		const orgId = "org-manifest-socket-dead";
		const socketPath = ptyDaemonSocketPath(orgId);
		const childPid = spawnIdleChild();
		try {
			try {
				fs.unlinkSync(socketPath);
			} catch {
				// best-effort cleanup from a failed prior run
			}
			const fake = await startFakeDaemon({
				socketPath,
				respondWithVersion: "0.1.0",
				daemonPid: process.pid,
			});
			try {
				writePtyDaemonManifest({
					pid: childPid,
					socketPath: path.join(os.tmpdir(), `dead-${process.pid}.sock`),
					protocolVersions: [1],
					startedAt: Date.now(),
					organizationId: orgId,
				});

				const sup = new DaemonSupervisor({
					scriptPath: "/nonexistent",
					autoUpdate: false,
				});
				const adopted = (await invokeTryAdopt(
					sup,
					orgId,
				)) as AdoptedForTest | null;
				expect(adopted).not.toBeNull();
				expect(adopted?.pid).toBe(process.pid);
				expect(adopted?.socketPath).toBe(socketPath);
				expect(isProcessAliveForTest(childPid)).toBe(true);
			} finally {
				await fake.close();
			}
		} finally {
			killIfAlive(childPid);
			try {
				fs.unlinkSync(socketPath);
			} catch {
				// best-effort
			}
		}
	}, 15_000);
});

describe("DaemonSupervisor daemon health", () => {
	test("returns null when there's no daemon for the org", () => {
		const sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
		expect(sup.getHealth("org-none")).toBeNull();
	});

	test("reports reachable while the daemon is answering", () => {
		const sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
		seedInstance(sup, "org-ok", {
			runningVersion: "0.1.0",
			expectedVersion: "0.1.0",
			updatePending: false,
			unreachableSince: null,
		});
		expect(sup.getHealth("org-ok")).toEqual({
			reachable: true,
			unreachableForMs: 0,
		});
	});

	test("reports how long the daemon has been silent", () => {
		const sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
		seedInstance(sup, "org-quiet", {
			runningVersion: "unknown",
			expectedVersion: "0.1.0",
			updatePending: false,
			unreachableSince: Date.now() - 12_000,
		});
		const health = sup.getHealth("org-quiet");
		expect(health?.reachable).toBe(false);
		// The UI's warn threshold keys off this, so it has to be a real duration.
		expect(health?.unreachableForMs).toBeGreaterThanOrEqual(12_000);
	});

	test("starts the clock when a live daemon stops answering", async () => {
		const fake = await startFakeDaemon({ silent: true });
		try {
			const sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
			seedInstance(sup, "org-goes-quiet", {
				runningVersion: "0.1.0",
				expectedVersion: "0.1.0",
				updatePending: false,
				unreachableSince: null,
				pid: process.pid,
				socketPath: fake.socketPath,
			});
			await invokeRefreshReachability(sup, "org-goes-quiet", process.pid);
			expect(sup.getHealth("org-goes-quiet")?.reachable).toBe(false);
		} finally {
			await fake.close();
		}
	});

	test("clears the silence and backfills the version once it answers again", async () => {
		const fake = await startFakeDaemon({ respondWithVersion: "0.1.0" });
		try {
			const sup = new DaemonSupervisor({
				scriptPath: "/nonexistent",
				autoUpdate: false,
			});
			// An adopt-unprobed instance: alive, version unknown, gone quiet.
			seedInstance(sup, "org-recovers", {
				runningVersion: "unknown",
				expectedVersion: "0.1.0",
				updatePending: false,
				unreachableSince: Date.now() - 30_000,
				pid: process.pid,
				socketPath: fake.socketPath,
			});
			await invokeRefreshReachability(sup, "org-recovers", process.pid);
			// Recovery must clear itself so the UI's warning disappears without
			// the user destroying shells that came back on their own.
			expect(sup.getHealth("org-recovers")).toEqual({
				reachable: true,
				unreachableForMs: 0,
			});
			// And the version we couldn't read at adoption is now resolved.
			expect(sup.getUpdateStatus("org-recovers")?.running).toBe("0.1.0");
		} finally {
			await fake.close();
		}
	});

	test("kicks off auto-update when the late probe reveals a stale version", async () => {
		// The adopt-time probe failed (version "unknown"), so the adopt path
		// skipped auto-update. The late read is the same discovery and must
		// take the same action — this is exactly the post-update-load boot
		// the adoption change is for.
		const fake = await startFakeDaemon({ respondWithVersion: "0.0.1" });
		try {
			const sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
			const kickoffMock = mock(() => {});
			(
				sup as unknown as { kickoffAutoUpdate: typeof kickoffMock }
			).kickoffAutoUpdate = kickoffMock;
			seedInstance(sup, "org-late-stale", {
				runningVersion: "unknown",
				expectedVersion: "0.2.5",
				updatePending: false,
				unreachableSince: Date.now() - 5_000,
				pid: process.pid,
				socketPath: fake.socketPath,
			});
			await invokeRefreshReachability(sup, "org-late-stale", process.pid);
			expect(sup.getUpdateStatus("org-late-stale")?.pending).toBe(true);
			expect(kickoffMock).toHaveBeenCalledTimes(1);
			expect(
				loggedEvents.some((e) => e.event === "pty_daemon_update_pending"),
			).toBe(true);
		} finally {
			await fake.close();
		}
	});

	test("late stale-version discovery respects autoUpdate: false", async () => {
		const fake = await startFakeDaemon({ respondWithVersion: "0.0.1" });
		try {
			const sup = new DaemonSupervisor({
				scriptPath: "/nonexistent",
				autoUpdate: false,
			});
			const kickoffMock = mock(() => {});
			(
				sup as unknown as { kickoffAutoUpdate: typeof kickoffMock }
			).kickoffAutoUpdate = kickoffMock;
			seedInstance(sup, "org-late-stale-noauto", {
				runningVersion: "unknown",
				expectedVersion: "0.2.5",
				updatePending: false,
				unreachableSince: Date.now() - 5_000,
				pid: process.pid,
				socketPath: fake.socketPath,
			});
			await invokeRefreshReachability(
				sup,
				"org-late-stale-noauto",
				process.pid,
			);
			// Still flagged for the UI, but no background handoff.
			expect(sup.getUpdateStatus("org-late-stale-noauto")?.pending).toBe(true);
			expect(kickoffMock).not.toHaveBeenCalled();
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
			autoUpdateFailure: null,
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
			autoUpdateFailure: null,
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
		expect(status?.autoUpdateFailure).toBeNull();
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

describe("DaemonSupervisor.update concurrency guard", () => {
	let sup: DaemonSupervisor;

	beforeEach(() => {
		sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
	});

	test("two concurrent update() calls coalesce to one runUpdate", async () => {
		// Mock the private runUpdate so we can observe call counts and
		// resolve on our schedule.
		const deferred = createDeferred<{ ok: true; successorPid: number }>();
		const runUpdateMock = mock(() => deferred.promise);
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;

		const a = sup.update("org-coalesce");
		const b = sup.update("org-coalesce");
		// Both calls should hand out the SAME promise (cached in-flight).
		expect(a).toBe(b);
		expect(runUpdateMock).toHaveBeenCalledTimes(1);

		deferred.resolve({ ok: true, successorPid: 42 });
		const [resA, resB] = await Promise.all([a, b]);
		expect(resA).toEqual({ ok: true, successorPid: 42 });
		expect(resB).toEqual({ ok: true, successorPid: 42 });
	});

	test("a fresh update() after the first resolves runs again (not stuck cached)", async () => {
		const calls: ReturnType<
			typeof createDeferred<{ ok: true; successorPid: number }>
		>[] = [];
		const runUpdateMock = mock(() => {
			const d = createDeferred<{ ok: true; successorPid: number }>();
			calls.push(d);
			return d.promise;
		});
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;

		const first = sup.update("org-recycle");
		calls[0]?.resolve({ ok: true, successorPid: 1 });
		await first;

		// Second call after the first settles should NOT return the cached
		// promise — it kicks off a new runUpdate.
		const second = sup.update("org-recycle");
		expect(runUpdateMock).toHaveBeenCalledTimes(2);
		calls[1]?.resolve({ ok: true, successorPid: 2 });
		await expect(second).resolves.toEqual({ ok: true, successorPid: 2 });
	});

	test("guard is per-organization", async () => {
		const runUpdateMock = mock(async () => ({
			ok: true as const,
			successorPid: 99,
		}));
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;

		const a = sup.update("org-A");
		const b = sup.update("org-B");
		expect(a).not.toBe(b);
		expect(runUpdateMock).toHaveBeenCalledTimes(2);
		await Promise.all([a, b]);
	});
});

describe("DaemonSupervisor.update failure mode", () => {
	// Manual smooth updates must keep the predecessor tracked on failure so
	// the renderer can offer force restart as the explicit destructive path.

	let sup: DaemonSupervisor;

	beforeEach(() => {
		sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
	});

	test("ok:false from runUpdate leaves the predecessor instance untouched", async () => {
		const PREDECESSOR_PID = 4242;
		seedPredecessor(sup, "org-fail", PREDECESSOR_PID);

		const runUpdateMock = mock(async () => ({
			ok: false as const,
			reason: "snapshot write failed: ENOSPC",
		}));
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;

		const result = await sup.update("org-fail");
		expect(result.ok).toBe(false);

		// Sessions live in the predecessor process — if we overwrote this
		// entry on failure the supervisor would lose track of them.
		const status = sup.getUpdateStatus("org-fail");
		expect(status?.running).toBe("0.1.0");
		expect(status?.pending).toBe(true);
		expect(getInstancePid(sup, "org-fail")).toBe(PREDECESSOR_PID);
	});

	test("runUpdate throwing leaves the predecessor instance untouched", async () => {
		const PREDECESSOR_PID = 5252;
		seedPredecessor(sup, "org-throw", PREDECESSOR_PID);

		(sup as unknown as { runUpdate: () => Promise<never> }).runUpdate =
			async () => {
				throw new Error("transport: ECONNRESET");
			};

		await expect(sup.update("org-throw")).rejects.toThrow(/ECONNRESET/);
		expect(getInstancePid(sup, "org-throw")).toBe(PREDECESSOR_PID);
	});
});

describe("DaemonSupervisor auto-update best effort", () => {
	let sup: DaemonSupervisor;

	beforeEach(() => {
		sup = new DaemonSupervisor({ scriptPath: "/nonexistent" });
	});

	test("leaves the predecessor running when the background smooth update returns ok:false", async () => {
		const instance = staleInstance("0.0.9");
		seedDaemonInstance(sup, "org-auto-best-effort", instance);
		const runUpdateMock = mock(async () => ({
			ok: false as const,
			reason: "snapshot write failed: ENOSPC",
		}));
		const forceRestartMock = mock(async () => ({ success: true as const }));
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;
		(
			sup as unknown as {
				forceRestart: () => Promise<{ success: true }>;
			}
		).forceRestart = forceRestartMock;

		invokeKickoffAutoUpdate(sup, "org-auto-best-effort", instance);
		await flushAutoUpdate();

		expect(runUpdateMock).toHaveBeenCalledWith("org-auto-best-effort");
		expect(forceRestartMock).not.toHaveBeenCalled();
		expect(getInstancePid(sup, "org-auto-best-effort")).toBe(instance.pid);
		const status = sup.getUpdateStatus("org-auto-best-effort");
		expect(status?.pending).toBe(true);
		expect(status?.autoUpdateFailure?.reason).toBe(
			"snapshot write failed: ENOSPC",
		);
		expect(
			loggedEvents.some(
				(e) =>
					e.event === "pty_daemon_auto_update_failed" &&
					e.props.reason === "snapshot write failed: ENOSPC" &&
					e.props.leftPending === true,
			),
		).toBe(true);
	});

	test("leaves the predecessor running when the background smooth update throws", async () => {
		const instance = staleInstance("0.0.8");
		seedDaemonInstance(sup, "org-auto-throw", instance);
		const runUpdateMock = mock(async () => {
			throw new Error("transport: ECONNRESET");
		});
		const forceRestartMock = mock(async () => ({ success: true as const }));
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;
		(
			sup as unknown as {
				forceRestart: () => Promise<{ success: true }>;
			}
		).forceRestart = forceRestartMock;

		invokeKickoffAutoUpdate(sup, "org-auto-throw", instance);
		await flushAutoUpdate();

		expect(forceRestartMock).not.toHaveBeenCalled();
		expect(getInstancePid(sup, "org-auto-throw")).toBe(instance.pid);
		const status = sup.getUpdateStatus("org-auto-throw");
		expect(status?.pending).toBe(true);
		expect(status?.autoUpdateFailure?.reason).toBe(
			"threw: transport: ECONNRESET",
		);
		expect(
			loggedEvents.some(
				(e) =>
					e.event === "pty_daemon_auto_update_failed" &&
					e.props.reason === "threw: transport: ECONNRESET" &&
					e.props.leftPending === true,
			),
		).toBe(true);
	});

	test("does not overwrite the current daemon if the failed update changed it", async () => {
		const instance = staleInstance("0.0.7");
		seedDaemonInstance(sup, "org-auto-changed", instance);
		const runUpdateMock = mock(async () => {
			seedDaemonInstance(sup, "org-auto-changed", {
				...instance,
				pid: 4321,
				runningVersion: instance.expectedVersion,
				updatePending: false,
			});
			return {
				ok: false as const,
				reason: "successor ack timed out after 5000ms",
			};
		});
		const forceRestartMock = mock(async () => ({ success: true as const }));
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;
		(
			sup as unknown as {
				forceRestart: () => Promise<{ success: true }>;
			}
		).forceRestart = forceRestartMock;

		invokeKickoffAutoUpdate(sup, "org-auto-changed", instance);
		await flushAutoUpdate();

		expect(forceRestartMock).not.toHaveBeenCalled();
		expect(getInstancePid(sup, "org-auto-changed")).toBe(4321);
		expect(
			sup.getUpdateStatus("org-auto-changed")?.autoUpdateFailure,
		).toBeNull();
		expect(
			loggedEvents.some(
				(e) =>
					e.event === "pty_daemon_auto_update_failed" &&
					e.props.reason === "successor ack timed out after 5000ms" &&
					e.props.leftPending === false,
			),
		).toBe(true);
	});

	test("attempts the handoff even when live sessions are present", async () => {
		const instance = staleInstance("0.0.6");
		seedDaemonInstance(sup, "org-auto-live", instance);
		mockListSessions(sup, [aliveSession()]);
		const runUpdateMock = mock(async () => ({
			ok: true as const,
			successorPid: 7777,
		}));
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;

		invokeKickoffAutoUpdate(sup, "org-auto-live", instance);
		await flushAutoUpdate();

		expect(runUpdateMock).toHaveBeenCalledWith("org-auto-live");
		expect(
			loggedEvents.some(
				(e) =>
					e.event === "pty_daemon_auto_update_ok" &&
					e.props.successorPid === 7777,
			),
		).toBe(true);
	});

	test("joins an existing manual update without adding a destructive fallback", async () => {
		const instance = staleInstance("0.0.6");
		seedDaemonInstance(sup, "org-auto-coalesced", instance);
		const deferred = createDeferred<{ ok: false; reason: string }>();
		const runUpdateMock = mock(() => deferred.promise);
		const forceRestartMock = mock(async () => ({ success: true as const }));
		(sup as unknown as { runUpdate: typeof runUpdateMock }).runUpdate =
			runUpdateMock;
		(
			sup as unknown as {
				forceRestart: () => Promise<{ success: true }>;
			}
		).forceRestart = forceRestartMock;

		const manualUpdate = sup.update("org-auto-coalesced");
		invokeKickoffAutoUpdate(sup, "org-auto-coalesced", instance);
		deferred.resolve({
			ok: false,
			reason: "manual smooth update failed",
		});

		await manualUpdate;
		await flushAutoUpdate();

		expect(runUpdateMock).toHaveBeenCalledTimes(1);
		expect(forceRestartMock).not.toHaveBeenCalled();
		expect(
			sup.getUpdateStatus("org-auto-coalesced")?.autoUpdateFailure,
		).toBeNull();
		expect(
			loggedEvents.some(
				(e) =>
					e.event === "pty_daemon_auto_update_failed" &&
					e.props.reason === "manual smooth update failed" &&
					e.props.leftPending === false,
			),
		).toBe(true);
	});
});

// ---------------- helpers ----------------

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
	reject: (e: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve: (v: T) => void = () => {};
	let reject: (e: unknown) => void = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

interface SeededFields {
	runningVersion: string;
	expectedVersion: string;
	updatePending: boolean;
	unreachableSince?: number | null;
	pid?: number;
	socketPath?: string;
}

function seedPredecessor(
	sup: DaemonSupervisor,
	organizationId: string,
	pid: number,
): void {
	(sup as unknown as { instances: Map<string, unknown> }).instances.set(
		organizationId,
		{
			pid,
			socketPath: "/tmp/seeded.sock",
			startedAt: Date.now(),
			runningVersion: "0.1.0",
			expectedVersion: "0.2.0",
			updatePending: true,
		},
	);
}

function getInstancePid(
	sup: DaemonSupervisor,
	organizationId: string,
): number | undefined {
	return (
		sup as unknown as { instances: Map<string, { pid: number }> }
	).instances.get(organizationId)?.pid;
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
		unreachableSince: null,
		...fields,
	});
}

function seedDaemonInstance(
	sup: DaemonSupervisor,
	organizationId: string,
	instance: ReturnType<typeof staleInstance>,
): void {
	(sup as unknown as { instances: Map<string, unknown> }).instances.set(
		organizationId,
		instance,
	);
}

function mockListSessions(
	sup: DaemonSupervisor,
	sessions: Awaited<ReturnType<DaemonSupervisor["listSessions"]>>,
): void {
	const listSessionsMock = mock(async () => sessions);
	(sup as unknown as { listSessions: typeof sup.listSessions }).listSessions =
		listSessionsMock as typeof sup.listSessions;
}

function aliveSession(id = "live") {
	return {
		id,
		pid: 4321,
		cols: 80,
		rows: 24,
		alive: true,
	};
}

async function flushAutoUpdate(): Promise<void> {
	await new Promise((r) => setTimeout(r, 0));
	await new Promise((r) => setTimeout(r, 0));
}

function freshInstance() {
	return {
		pid: 1234,
		socketPath: "/tmp/fresh.sock",
		startedAt: Date.now(),
		runningVersion: "0.1.0",
		expectedVersion: "0.1.0",
		updatePending: false,
		unreachableSince: null,
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

function invokeKickoffAutoUpdate(
	sup: DaemonSupervisor,
	organizationId: string,
	instance: ReturnType<typeof staleInstance>,
): void {
	(
		sup as unknown as {
			kickoffAutoUpdate: (id: string, inst: typeof instance) => void;
		}
	).kickoffAutoUpdate(organizationId, instance);
}

function invokeRefreshReachability(
	sup: DaemonSupervisor,
	organizationId: string,
	pid: number,
): Promise<void> {
	return (
		sup as unknown as {
			refreshReachability: (id: string, pid: number) => Promise<void>;
		}
	).refreshReachability(organizationId, pid);
}

function invokeTryAdopt(
	sup: DaemonSupervisor,
	organizationId: string,
): Promise<unknown | null> {
	return (
		sup as unknown as {
			tryAdopt: (id: string) => Promise<unknown | null>;
		}
	).tryAdopt(organizationId);
}

/** A live pid that is definitely not a pty-daemon. */
function spawnIdleChild(): number {
	const child = childProcess.spawn(
		process.execPath,
		["-e", "setInterval(() => {}, 1000)"],
		{ stdio: "ignore" },
	);
	const childPid = child.pid;
	expect(typeof childPid).toBe("number");
	if (!childPid) throw new Error("failed to spawn idle child");
	return childPid;
}

function killIfAlive(pid: number): void {
	if (!isProcessAliveForTest(pid)) return;
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// already gone
	}
}

async function waitForProcessExit(
	pid: number,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isProcessAliveForTest(pid)) return true;
		await new Promise((r) => setTimeout(r, 25));
	}
	return false;
}

function isProcessAliveForTest(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

describe("ptyDaemonSocketPath", () => {
	const ORG = "org-socket-path";
	const legacyPath = () => {
		const shortId = createHash("sha256").update(ORG).digest("hex").slice(0, 12);
		return path.join(os.tmpdir(), `superset-ptyd-${shortId}.sock`);
	};

	test("every production home keeps the legacy org-only path", () => {
		expect(ptyDaemonSocketPath(ORG, { NODE_ENV: "production" })).toBe(
			legacyPath(),
		);
		expect(
			ptyDaemonSocketPath(ORG, {
				NODE_ENV: "production",
				SUPERSET_HOME_DIR: path.join(os.homedir(), ".superset"),
			}),
		).toBe(legacyPath());
		expect(
			ptyDaemonSocketPath(ORG, {
				NODE_ENV: "production",
				SUPERSET_HOME_DIR: "/tmp/custom-production-home",
			}),
		).toBe(legacyPath());
	});

	test("non-default development homes get their own stable daemon socket", () => {
		const a = ptyDaemonSocketPath(ORG, {
			NODE_ENV: "development",
			SUPERSET_HOME_DIR: "/tmp/home-a",
		});
		const b = ptyDaemonSocketPath(ORG, {
			NODE_ENV: "development",
			SUPERSET_HOME_DIR: "/tmp/home-b",
		});
		expect(a).not.toBe(legacyPath());
		expect(b).not.toBe(legacyPath());
		expect(a).not.toBe(b);
		expect(
			ptyDaemonSocketPath(ORG, {
				NODE_ENV: "development",
				SUPERSET_HOME_DIR: "/tmp/home-a",
			}),
		).toBe(a);
	});

	test("development with a default home keeps the legacy org-only path", () => {
		expect(ptyDaemonSocketPath(ORG, { NODE_ENV: "development" })).toBe(
			legacyPath(),
		);
		expect(
			ptyDaemonSocketPath(ORG, {
				NODE_ENV: "development",
				SUPERSET_HOME_DIR: `${path.join(os.homedir(), ".superset")}/../.superset/`,
			}),
		).toBe(legacyPath());
	});

	test("stays under Darwin's 104-byte sun_path limit for long worktree homes", () => {
		const socket = ptyDaemonSocketPath("a1b2c3d4-e5f6-7890-abcd-ef1234567890", {
			NODE_ENV: "development",
			SUPERSET_HOME_DIR:
				"/Users/someone/.superset/worktrees/0123456789abcdef-0123/very-long-branch-name-for-a-feature/superset-dev-data",
		});
		expect(Buffer.byteLength(socket)).toBeLessThan(104);
	});
});
