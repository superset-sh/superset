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

beforeEach(() => {
	tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pty-daemon-it-"));
	originalHome = process.env.SUPERSET_HOME_DIR;
	process.env.SUPERSET_HOME_DIR = tmpHome;
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

			// Fresh supervisor adopts and probes.
			const sup = new DaemonSupervisor({ scriptPath: DAEMON_BUNDLE });
			supervisorsToCleanup.push({ sup, orgId });
			const adopted = await sup.ensure(orgId);
			assert.equal(adopted.runningVersion, "0.0.1");
			assert.equal(adopted.expectedVersion, "0.1.0");
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
