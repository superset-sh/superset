// Real-spawn integration tests for DaemonSupervisor.
// Runs under Node (`node --experimental-strip-types --test`) because the
// supervisor uses `process.execPath` to spawn the daemon, and the daemon
// imports node-pty (a native addon that needs Node ABI).
//
// Unit-level coverage for the same surface lives in DaemonSupervisor.test.ts
// (under bun test). These integration tests catch process-lifecycle bugs
// that mocks don't (PID liveness, manifest IO across supervisor instances,
// real socket connectivity).

import { strict as assert } from "node:assert";
import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { DaemonSupervisor } from "./DaemonSupervisor.ts";
import {
	type PtyDaemonManifest,
	ptyDaemonManifestDir,
	writePtyDaemonManifest,
} from "./manifest.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// packages/host-service/src/daemon → packages/pty-daemon/dist/pty-daemon.js
const DAEMON_BUNDLE = path.resolve(
	__dirname,
	"../../../pty-daemon/dist/pty-daemon.js",
);

if (!fs.existsSync(DAEMON_BUNDLE)) {
	throw new Error(
		`Daemon bundle missing at ${DAEMON_BUNDLE}. Run \`bun run build:daemon\` in packages/pty-daemon first.`,
	);
}

let tmpHome: string;
let originalHome: string | undefined;
const supervisorsToCleanup: { sup: DaemonSupervisor; orgId: string }[] = [];
let originalNodeEnv: string | undefined;

beforeEach(() => {
	tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pty-daemon-it-"));
	originalHome = process.env.SUPERSET_HOME_DIR;
	process.env.SUPERSET_HOME_DIR = tmpHome;
	// Force production semantics for these tests: in dev mode the
	// supervisor kills any leftover daemon on startup, which breaks the
	// adoption tests that intentionally seed a running daemon. Real dev
	// behavior is exercised through manual QA, not here.
	originalNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = "production";
});

afterEach(async () => {
	// Detached daemons survive the test process by design — kill any we
	// spawned so they don't leak across test runs.
	for (const { sup, orgId } of supervisorsToCleanup.splice(0)) {
		try {
			await sup.stop(orgId);
		} catch {
			// best-effort
		}
	}
	if (originalHome !== undefined) {
		process.env.SUPERSET_HOME_DIR = originalHome;
	} else {
		delete process.env.SUPERSET_HOME_DIR;
	}
	if (originalNodeEnv !== undefined) {
		process.env.NODE_ENV = originalNodeEnv;
	} else {
		delete process.env.NODE_ENV;
	}
	try {
		fs.rmSync(tmpHome, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

describe("DaemonSupervisor.ensure (real spawn)", () => {
	test("spawns a fresh daemon and reports running == expected", async () => {
		const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
		supervisorsToCleanup.push({ sup, orgId: "org-spawn" });
		const inst = await sup.ensure("org-spawn");
		assert.ok(inst.pid > 0, "expected a positive pid");
		assert.equal(inst.runningVersion, inst.expectedVersion);
		assert.equal(inst.updatePending, false);
		assert.equal(await isReachable(inst.socketPath), true);
	});

	test("adopts a running daemon across supervisor instances", async () => {
		const supA = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
		const a = await supA.ensure("org-adopt");
		assert.ok(a.pid > 0);

		// Track the daemon for cleanup; we'll stop via supervisor B since
		// that's the live owner by the end of the test.
		try {
			// Supervisor B simulates a host-service restart — fresh state,
			// but the manifest + running daemon are still on disk/live.
			const supB = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
			supervisorsToCleanup.push({ sup: supB, orgId: "org-adopt" });
			const b = await supB.ensure("org-adopt");
			assert.equal(b.pid, a.pid, "B should adopt A's daemon");
			assert.equal(b.socketPath, a.socketPath);
			assert.equal(b.runningVersion, a.expectedVersion);
			assert.equal(b.updatePending, false);
		} catch (err) {
			// On failure, make sure A still cleans up.
			await supA.stop("org-adopt").catch(() => {});
			throw err;
		}
	});

	test("flags updatePending when running daemon is older than expected", async () => {
		// We spawn the daemon DIRECTLY (not via supervisor.ensure), pinning
		// its version to "0.0.1" via env. Then we write the manifest and
		// hand the supervisor a fresh instance that adopts via tryAdopt.
		// Going through supervisor.ensure for the spawn would inject
		// EXPECTED_DAEMON_VERSION (0.1.0) into childEnv, defeating the
		// older-version setup.
		const orgId = "org-stale";
		const socketPath = path.join(
			os.tmpdir(),
			`superset-ptyd-${crypto
				.createHash("sha256")
				.update(orgId)
				.digest("hex")
				.slice(0, 12)}.sock`,
		);
		// Clean up any leftover socket from prior runs.
		try {
			fs.unlinkSync(socketPath);
		} catch {}

		const child = childProcess.spawn(
			process.execPath,
			[DAEMON_BUNDLE, `--socket=${socketPath}`],
			{
				detached: true,
				stdio: "ignore",
				env: { ...process.env, SUPERSET_PTY_DAEMON_VERSION: "0.0.1" },
			},
		);
		child.unref();
		// Wait for the socket to come up.
		const ready = await waitForSocket(socketPath, 5000);
		assert.equal(ready, true, "daemon socket did not become ready");

		try {
			// Write the manifest the supervisor needs to find the daemon.
			fs.mkdirSync(ptyDaemonManifestDir(orgId), {
				recursive: true,
				mode: 0o700,
			});
			const manifest: PtyDaemonManifest = {
				pid: child.pid as number,
				socketPath,
				protocolVersions: [1],
				startedAt: Date.now(),
				organizationId: orgId,
			};
			writePtyDaemonManifest(manifest);

			// Fresh supervisor adopts and probes. autoUpdate=false because
			// this test asserts the version-drift flag — auto-update would
			// race a real handoff right after ensure() returns.
			const sup = new DaemonSupervisor({
				scriptPath: DAEMON_BUNDLE,
				autoUpdate: false,
			});
			supervisorsToCleanup.push({ sup, orgId });
			const adopted = await sup.ensure(orgId);
			assert.equal(adopted.runningVersion, "0.0.1");
			// expectedVersion is whatever the host-service ships (read from
			// EXPECTED_DAEMON_VERSION); we don't pin it in this test.
			assert.notEqual(
				adopted.expectedVersion,
				"0.0.1",
				"expectedVersion should be the host-service's bundled version, not the predecessor's stale 0.0.1",
			);
			assert.equal(adopted.updatePending, true);
		} catch (err) {
			// On failure, kill the orphaned daemon ourselves.
			try {
				if (child.pid) process.kill(child.pid, "SIGTERM");
			} catch {}
			throw err;
		}
	});

	test("restart() kills the old daemon and spawns a new one", async () => {
		const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
		supervisorsToCleanup.push({ sup, orgId: "org-restart" });
		const a = await sup.ensure("org-restart");
		const aPid = a.pid;

		await sup.restart("org-restart");
		const after = (
			sup as unknown as { instances: Map<string, { pid: number }> }
		).instances.get("org-restart");
		assert.ok(after, "expected an instance after restart");
		assert.notEqual(after.pid, aPid, "expected a new pid after restart");
		// Old PID is dead within a beat.
		await new Promise((r) => setTimeout(r, 200));
		assert.equal(isAlive(aPid), false);
	});

	test("auto-respawns after the running daemon dies unexpectedly", async () => {
		// SIGKILL the running daemon, wait for the supervisor's on-exit
		// handler to fire, and verify a new daemon comes up. Crash-budget
		// behavior past this point is covered by the unit tests in
		// DaemonSupervisor.test.ts (mocked stop/ensure for determinism —
		// killing 4 daemons in a row from this test would race with the
		// auto-respawn loop).
		const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
		supervisorsToCleanup.push({ sup, orgId: "org-respawn" });
		const a = await sup.ensure("org-respawn");
		const aPid = a.pid;

		process.kill(aPid, "SIGKILL");

		// Wait for the on-exit handler to register the death and respawn.
		// The supervisor's auto-respawn fires inside `child.on("exit")`.
		const deadline = Date.now() + 8000;
		let _next = sup.getSocketPath("org-respawn");
		while (Date.now() < deadline) {
			const inst = (
				sup as unknown as { instances: Map<string, { pid: number }> }
			).instances.get("org-respawn");
			if (inst && inst.pid !== aPid) {
				_next = inst as unknown as string;
				break;
			}
			await new Promise((r) => setTimeout(r, 100));
		}
		const after = (
			sup as unknown as { instances: Map<string, { pid: number }> }
		).instances.get("org-respawn");
		assert.ok(after, "expected a respawned instance");
		assert.notEqual(after.pid, aPid);
	});

	test("detects when an adopted daemon dies externally", async () => {
		// Adopted daemons (PIDs from a manifest, not spawned children)
		// don't fire `child.on("exit")` when killed externally. The
		// supervisor must poll PID liveness to notice and clear the
		// stale instance so the next ensure() respawns. Without this,
		// host-service would keep handing out a dead socket path until
		// something else forced a restart.
		const orgId = "org-adopted-died";

		// Supervisor A spawns the daemon. We'll then construct a
		// supervisor B that adopts via manifest, verify the adopted
		// PID, kill it externally, and assert B clears its instance.
		const supA = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
		const a = await supA.ensure(orgId);
		const adoptedPid = a.pid;

		const supB = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
		supervisorsToCleanup.push({ sup: supB, orgId });
		const b = await supB.ensure(orgId);
		assert.equal(b.pid, adoptedPid, "B should adopt A's daemon");

		// Externally kill the adopted daemon. supA never had a child
		// handle so its on-exit handler can't fire; supB only adopted
		// (no child handle either). The poller must catch this.
		process.kill(adoptedPid, "SIGKILL");

		// Wait up to 6s for the liveness poller (2s interval) to fire.
		const deadline = Date.now() + 6000;
		while (Date.now() < deadline) {
			const inst = (
				supB as unknown as { instances: Map<string, { pid: number }> }
			).instances.get(orgId);
			if (!inst) break;
			await new Promise((r) => setTimeout(r, 200));
		}
		const after = (
			supB as unknown as { instances: Map<string, { pid: number }> }
		).instances.get(orgId);
		assert.equal(
			after,
			undefined,
			"supervisor should have cleared the dead adopted instance",
		);

		// Next ensure() should respawn fresh.
		const fresh = await supB.ensure(orgId);
		assert.notEqual(fresh.pid, adoptedPid);
		assert.equal(isAlive(fresh.pid), true);
	});
});

describe("DaemonSupervisor.update (Phase 2 fd-handoff)", () => {
	test("update() preserves live sessions across a daemon binary swap", async () => {
		// End-to-end: spawn fresh daemon, open a session via DaemonClient,
		// call update(), verify the successor has the session with the
		// original shell pid still alive. This is THE Phase 2 success
		// criterion at the supervisor layer.
		const orgId = "org-update";
		const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
		supervisorsToCleanup.push({ sup, orgId });
		const a = await sup.ensure(orgId);
		const predecessorPid = a.pid;

		// Open a session that will sleep long enough to outlive the handoff.
		const { DaemonClient } = await import("../terminal/DaemonClient/index.ts");
		const client = new DaemonClient({ socketPath: a.socketPath });
		await client.connect();
		const opened = await client.open("upd-0", {
			shell: "/bin/sh",
			argv: ["-c", "echo before; sleep 30"],
			cols: 80,
			rows: 24,
		});
		const shellPid = opened.pid;
		assert.ok(shellPid > 0, "expected a positive shell pid");
		await client.dispose();

		const result = await sup.update(orgId);
		assert.equal(result.ok, true, JSON.stringify(result));
		if (!result.ok) return;
		assert.notEqual(
			result.successorPid,
			predecessorPid,
			"successor pid should differ from predecessor",
		);

		// Predecessor exits shortly after the handoff completes.
		await new Promise((r) => setTimeout(r, 300));
		assert.equal(
			isAlive(predecessorPid),
			false,
			`predecessor pid ${predecessorPid} should be dead after handoff`,
		);
		assert.equal(
			isAlive(result.successorPid),
			true,
			`successor pid ${result.successorPid} should be alive`,
		);

		// Reconnect and confirm the session survived with its original pid.
		const successorInst = (
			sup as unknown as {
				instances: Map<string, { pid: number; socketPath: string }>;
			}
		).instances.get(orgId);
		assert.ok(successorInst, "supervisor should have a successor instance");
		assert.equal(successorInst.pid, result.successorPid);

		const client2 = new DaemonClient({ socketPath: successorInst.socketPath });
		await client2.connect();
		const sessions = await client2.list();
		const survived = sessions.find((s) => s.id === "upd-0");
		assert.ok(
			survived,
			`expected upd-0 in survivor list: ${JSON.stringify(sessions)}`,
		);
		assert.equal(survived.alive, true, "session should still be alive");
		assert.equal(
			survived.pid,
			shellPid,
			`shell pid should match across handoff (was ${shellPid}, got ${survived.pid})`,
		);

		// Cleanup: the surviving session.
		await client2.close("upd-0", "SIGKILL").catch(() => {});
		await client2.dispose();
	});

	test("auto-update on adopt opportunistically swaps in the bundled binary", async () => {
		// Adopt a daemon pinned to an old version, then construct a fresh
		// supervisor with autoUpdate=true (default). It should detect the
		// drift, kick off a handoff in the background, and the running
		// daemon's pid should change to the successor's within a few
		// seconds.
		const orgId = "org-auto-update";
		const socketPath = path.join(
			os.tmpdir(),
			`superset-ptyd-${crypto
				.createHash("sha256")
				.update(orgId)
				.digest("hex")
				.slice(0, 12)}.sock`,
		);
		try {
			fs.unlinkSync(socketPath);
		} catch {}

		const child = childProcess.spawn(
			process.execPath,
			[DAEMON_BUNDLE, `--socket=${socketPath}`],
			{
				detached: true,
				stdio: "ignore",
				env: { ...process.env, SUPERSET_PTY_DAEMON_VERSION: "0.0.1" },
			},
		);
		child.unref();
		const ready = await waitForSocket(socketPath, 5000);
		assert.equal(ready, true);

		try {
			fs.mkdirSync(ptyDaemonManifestDir(orgId), {
				recursive: true,
				mode: 0o700,
			});
			writePtyDaemonManifest({
				pid: child.pid as number,
				socketPath,
				protocolVersions: [1],
				startedAt: Date.now(),
				organizationId: orgId,
			});

			const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
			supervisorsToCleanup.push({ sup, orgId });
			const adopted = await sup.ensure(orgId);
			assert.equal(adopted.updatePending, true);
			const oldPid = adopted.pid;

			// Auto-update fires asynchronously. Poll the supervisor's
			// instance map for the pid swap (gives up after 8s).
			const deadline = Date.now() + 8000;
			let currentPid = oldPid;
			while (Date.now() < deadline) {
				const inst = (
					sup as unknown as { instances: Map<string, { pid: number }> }
				).instances.get(orgId);
				if (inst && inst.pid !== oldPid) {
					currentPid = inst.pid;
					break;
				}
				await new Promise((r) => setTimeout(r, 100));
			}
			assert.notEqual(
				currentPid,
				oldPid,
				`auto-update did not swap pid within 8s (still ${oldPid})`,
			);
			assert.equal(isAlive(currentPid), true, "successor should be alive");
			// Predecessor exits via setTimeout(50ms) after sending the
			// upgrade-prepared reply that resolved update(). The instance-
			// map swap above happens BEFORE that timer fires — give the
			// predecessor a moment to actually exit before asserting.
			const exitDeadline = Date.now() + 2000;
			while (Date.now() < exitDeadline && isAlive(oldPid)) {
				await new Promise((r) => setTimeout(r, 50));
			}
			assert.equal(
				isAlive(oldPid),
				false,
				`predecessor pid ${oldPid} should be dead after auto-update`,
			);
		} catch (err) {
			try {
				if (child.pid) process.kill(child.pid, "SIGTERM");
			} catch {}
			throw err;
		}
	});

	test("update() clears updatePending when predecessor was running an older version", async () => {
		// Regression for "Update daemon stuck on UPDATE AVAILABLE": the
		// post-update version probe used to either race the predecessor
		// or trust the env it inherited, recording the OLD version as the
		// successor's. This test pins the predecessor at 0.0.1-stale via
		// env and asserts post-update running != stale, pending=false.
		const orgId = "org-update-version";
		const socketPath = path.join(
			os.tmpdir(),
			`superset-ptyd-${crypto
				.createHash("sha256")
				.update(orgId)
				.digest("hex")
				.slice(0, 12)}.sock`,
		);
		try {
			fs.unlinkSync(socketPath);
		} catch {}

		const child = childProcess.spawn(
			process.execPath,
			[DAEMON_BUNDLE, `--socket=${socketPath}`],
			{
				detached: true,
				stdio: "ignore",
				env: { ...process.env, SUPERSET_PTY_DAEMON_VERSION: "0.0.1-stale" },
			},
		);
		child.unref();
		const ready = await waitForSocket(socketPath, 5000);
		assert.equal(ready, true);

		try {
			fs.mkdirSync(ptyDaemonManifestDir(orgId), {
				recursive: true,
				mode: 0o700,
			});
			writePtyDaemonManifest({
				pid: child.pid as number,
				socketPath,
				protocolVersions: [1],
				startedAt: Date.now(),
				organizationId: orgId,
			});

			// Disable autoUpdate so we exercise sup.update() explicitly,
			// not the background update path. (autoUpdate has its own test.)
			const sup = new DaemonSupervisor({
				scriptPath: DAEMON_BUNDLE,
				autoUpdate: false,
			});
			supervisorsToCleanup.push({ sup, orgId });
			const adopted = await sup.ensure(orgId);
			assert.equal(
				adopted.runningVersion,
				"0.0.1-stale",
				"adopted predecessor should report the env-pinned stale version",
			);
			assert.equal(adopted.updatePending, true);

			const result = await sup.update(orgId);
			assert.equal(
				result.ok,
				true,
				`update() failed: ${JSON.stringify(result)}`,
			);

			const status = sup.getUpdateStatus(orgId);
			assert.ok(status, "supervisor should have status after update");
			assert.notEqual(
				status.running,
				"0.0.1-stale",
				"successor must NOT report the predecessor's stale env version — main.ts ignores env in handoff mode and Server.prepareUpgrade strips it from the spawn env",
			);
			assert.notEqual(
				status.running,
				"unknown",
				"version probe must succeed — waitForPidExit gates the probe on predecessor exit",
			);
			assert.equal(
				status.pending,
				false,
				`updatePending should clear once successor reports a non-stale version (running=${status.running}, expected=${status.expected})`,
			);
		} catch (err) {
			try {
				if (child.pid) process.kill(child.pid, "SIGTERM");
			} catch {}
			throw err;
		}
	});

	test("auto-update with zero live sessions completes cleanly", async () => {
		// Snapshot has zero session frames; successor adopts nothing and
		// rebinds. Easy to break under refactors that assume sessions > 0.
		const orgId = "org-empty-handoff";
		const socketPath = path.join(
			os.tmpdir(),
			`superset-ptyd-${crypto
				.createHash("sha256")
				.update(orgId)
				.digest("hex")
				.slice(0, 12)}.sock`,
		);
		try {
			fs.unlinkSync(socketPath);
		} catch {}

		const child = childProcess.spawn(
			process.execPath,
			[DAEMON_BUNDLE, `--socket=${socketPath}`],
			{
				detached: true,
				stdio: "ignore",
				env: { ...process.env, SUPERSET_PTY_DAEMON_VERSION: "0.0.1" },
			},
		);
		child.unref();
		const ready = await waitForSocket(socketPath, 5000);
		assert.equal(ready, true);

		try {
			fs.mkdirSync(ptyDaemonManifestDir(orgId), {
				recursive: true,
				mode: 0o700,
			});
			writePtyDaemonManifest({
				pid: child.pid as number,
				socketPath,
				protocolVersions: [1],
				startedAt: Date.now(),
				organizationId: orgId,
			});

			// autoUpdate defaults to true — adopt fires the background handoff.
			const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
			supervisorsToCleanup.push({ sup, orgId });
			const adopted = await sup.ensure(orgId);
			assert.equal(adopted.updatePending, true);
			const oldPid = adopted.pid;

			const deadline = Date.now() + 5000;
			let currentPid = oldPid;
			while (Date.now() < deadline) {
				const inst = (
					sup as unknown as { instances: Map<string, { pid: number }> }
				).instances.get(orgId);
				if (inst && inst.pid !== oldPid) {
					currentPid = inst.pid;
					break;
				}
				await new Promise((r) => setTimeout(r, 100));
			}
			assert.notEqual(
				currentPid,
				oldPid,
				`auto-update did not swap pid within 5s (still ${oldPid})`,
			);

			const status = sup.getUpdateStatus(orgId);
			assert.ok(status, "supervisor should have status post-update");
			assert.equal(
				status.pending,
				false,
				`updatePending should clear after auto-update (running=${status.running})`,
			);
			assert.notEqual(
				status.running,
				"unknown",
				"version probe must succeed after empty-snapshot handoff",
			);
		} catch (err) {
			try {
				if (child.pid) process.kill(child.pid, "SIGTERM");
			} catch {}
			throw err;
		}
	});

	test("auto-update failure force-restarts the daemon", async () => {
		// Heavy path: auto-update fires on every adopt with version drift.
		// When smooth handoff fails during automatic app update, there is no
		// foreground UI to ask the user for the destructive fallback. The
		// supervisor force-restarts so the app does not keep adopting a stale
		// daemon indefinitely.
		const orgId = "org-autoupdate-fail";
		const socketPath = path.join(
			os.tmpdir(),
			`superset-ptyd-${crypto
				.createHash("sha256")
				.update(orgId)
				.digest("hex")
				.slice(0, 12)}.sock`,
		);
		try {
			fs.unlinkSync(socketPath);
		} catch {}

		const child = childProcess.spawn(
			process.execPath,
			[DAEMON_BUNDLE, `--socket=${socketPath}`],
			{
				detached: true,
				stdio: "ignore",
				env: { ...process.env, SUPERSET_PTY_DAEMON_VERSION: "0.0.1" },
			},
		);
		child.unref();

		try {
			const ready = await waitForSocket(socketPath, 5000);
			assert.equal(ready, true);

			// Open a session BEFORE auto-update kicks in. This is the
			// "user has live shells" path — the failure must leave them alone.
			const { DaemonClient } = await import(
				"../terminal/DaemonClient/index.ts"
			);
			const client = new DaemonClient({ socketPath });
			await client.connect();
			const opened = await client.open("survivor", {
				shell: "/bin/sh",
				argv: ["-c", "echo alive; sleep 30"],
				cols: 80,
				rows: 24,
			});
			const shellPid = opened.pid;
			assert.ok(shellPid > 0);
			await client.dispose();

			fs.mkdirSync(ptyDaemonManifestDir(orgId), {
				recursive: true,
				mode: 0o700,
			});
			writePtyDaemonManifest({
				pid: child.pid as number,
				socketPath,
				protocolVersions: [1],
				startedAt: Date.now(),
				organizationId: orgId,
			});

			// Predecessor uses process.argv[1] (its own bundle) for handoff,
			// not the supervisor's scriptPath — so injecting a bad scriptPath
			// won't fail the update. Override runUpdate directly to drive the
			// failure deterministically.
			const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
			supervisorsToCleanup.push({ sup, orgId });
			(
				sup as unknown as {
					runUpdate: () => Promise<{ ok: false; reason: string }>;
				}
			).runUpdate = async () => ({
				ok: false,
				reason: "induced failure (test): simulated transient error",
			});

			const adopted = await sup.ensure(orgId);
			assert.equal(adopted.updatePending, true);
			const predecessorPid = adopted.pid;

			// Auto-update is fire-and-forget. Smooth update fails first, then
			// the fallback force-restart swaps the daemon pid.
			const deadline = Date.now() + 5000;
			let currentPid = predecessorPid;
			while (Date.now() < deadline) {
				const inst = (
					sup as unknown as { instances: Map<string, { pid: number }> }
				).instances.get(orgId);
				if (inst && inst.pid !== predecessorPid) {
					currentPid = inst.pid;
					break;
				}
				await new Promise((r) => setTimeout(r, 100));
			}
			assert.notEqual(
				currentPid,
				predecessorPid,
				`auto-update fallback did not force-restart within 5s (still ${predecessorPid})`,
			);
			assert.equal(isAlive(currentPid), true, "fresh daemon should be alive");

			const status = sup.getUpdateStatus(orgId);
			assert.ok(status);
			assert.equal(
				status.pending,
				false,
				`pending must clear after force restart (running=${status.running})`,
			);

			const exitDeadline = Date.now() + 2000;
			while (Date.now() < exitDeadline && isAlive(predecessorPid)) {
				await new Promise((r) => setTimeout(r, 50));
			}
			assert.equal(
				isAlive(predecessorPid),
				false,
				"predecessor pid must be terminated by force restart",
			);

			const verifyClient = new DaemonClient({ socketPath });
			await verifyClient.connect();
			const sessions = await verifyClient.list();
			const survivor = sessions.find((s) => s.id === "survivor");
			assert.equal(
				survivor,
				undefined,
				`force restart must drop predecessor sessions: ${JSON.stringify(sessions)}`,
			);
			await verifyClient.dispose();
		} catch (err) {
			try {
				if (child.pid) process.kill(child.pid, "SIGTERM");
			} catch {}
			throw err;
		}
	});

	test("update() returns ok:false and leaves predecessor alive when there's no daemon", async () => {
		const orgId = "org-update-noop";
		const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
		supervisorsToCleanup.push({ sup, orgId });
		// Don't ensure() — there's no instance.
		const result = await sup.update(orgId);
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.match(result.reason, /no daemon running/);
		}
	});
});

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

function isReachable(socketPath: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const timer = setTimeout(() => {
			sock.destroy();
			resolve(false);
		}, 500);
		sock.once("connect", () => {
			clearTimeout(timer);
			sock.end();
			resolve(true);
		});
		sock.once("error", () => {
			clearTimeout(timer);
			resolve(false);
		});
	});
}

async function waitForSocket(
	socketPath: string,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (fs.existsSync(socketPath)) {
			if (await isReachable(socketPath)) return true;
		}
		await new Promise((r) => setTimeout(r, 50));
	}
	return false;
}
