// PtyDaemonCoordinator — sibling of HostServiceCoordinator, owns the
// per-organization pty-daemon process. Spawns or adopts the daemon and
// returns its Unix-socket path. host-service is told the path via
// SUPERSET_PTY_DAEMON_SOCKET so its DaemonClient can connect.
//
// Why detached spawn (matches host-service's approach): the daemon must
// outlive the desktop main process and host-service restarts. PTY ownership
// lives here so the rest of the system can be killed/restarted freely
// without losing user shells.

import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { SUPERSET_HOME_DIR } from "./app-environment";
import { isProcessAlive } from "./host-service-manifest";
import { MAX_HOST_LOG_BYTES, openRotatingLogFd } from "./host-service-utils";
import {
	type PtyDaemonManifest,
	ptyDaemonManifestDir,
	readPtyDaemonManifest,
	removePtyDaemonManifest,
	writePtyDaemonManifest,
} from "./pty-daemon-manifest";

interface DaemonInstance {
	pid: number;
	socketPath: string;
	startedAt: number;
}

const SOCKET_READY_TIMEOUT_MS = 5_000;

/**
 * Crash supervision parameters. If the daemon for an organization crashes
 * more than CRASH_BUDGET times within CRASH_WINDOW_MS, we stop respawning
 * and surface a hard error — repeated crashes are a bug, not transient
 * recovery. Per the implementation plan's Open Decision #3.
 */
const CRASH_BUDGET = 3;
const CRASH_WINDOW_MS = 60_000;

/**
 * Per-organization socket path. **Must stay short** — Darwin's `sun_path`
 * is 104 bytes, and `$SUPERSET_HOME_DIR/host/{orgId}/pty-daemon.sock` blows
 * past that in dev (worktree-relative SUPERSET_HOME_DIR + 36-char UUID).
 *
 * We put the socket in `os.tmpdir()` with a hash of the org id. Owner-only
 * file mode (0600, set by the daemon's Server.listen) is the auth boundary;
 * the directory permissions don't matter.
 */
function ptyDaemonSocketPath(organizationId: string): string {
	const shortId = createHash("sha256")
		.update(organizationId)
		.digest("hex")
		.slice(0, 12);
	return path.join(os.tmpdir(), `superset-ptyd-${shortId}.sock`);
}

export interface PtyDaemonCoordinatorOptions {
	/** Path to the daemon entry script (e.g. dist/pty-daemon.js). */
	scriptPath: string;
}

export class PtyDaemonCoordinator {
	private readonly opts: PtyDaemonCoordinatorOptions;
	private readonly instances = new Map<string, DaemonInstance>();
	private readonly pendingStarts = new Map<string, Promise<DaemonInstance>>();
	/** Recent crash timestamps per orgId, for the circuit breaker. */
	private readonly crashTimes = new Map<string, number[]>();
	/** Orgs we've explicitly stopped — exit isn't a crash, don't respawn. */
	private readonly stopping = new Set<string>();
	/** Orgs that tripped the circuit breaker — refuse respawn until cleared. */
	private readonly circuitOpen = new Set<string>();

	constructor(opts: PtyDaemonCoordinatorOptions) {
		this.opts = opts;
	}

	/**
	 * Has the org tripped the crash circuit breaker? Once tripped, ensure()
	 * fails fast with a clear error until clearCrashCircuit() is called.
	 */
	isCircuitOpen(organizationId: string): boolean {
		return this.circuitOpen.has(organizationId);
	}

	/**
	 * Reset the crash counter and close the circuit. Call this from a UI
	 * "retry" action after surfacing the error to the user.
	 */
	clearCrashCircuit(organizationId: string): void {
		this.circuitOpen.delete(organizationId);
		this.crashTimes.delete(organizationId);
	}

	/**
	 * Spawn the daemon if not already running for this organization, or
	 * adopt the running one. Returns the socket path host-service should
	 * connect to.
	 */
	async ensure(organizationId: string): Promise<DaemonInstance> {
		if (this.circuitOpen.has(organizationId)) {
			throw new Error(
				`[pty-daemon:${organizationId}] crash circuit open: ${CRASH_BUDGET} crashes within ${CRASH_WINDOW_MS / 1000}s. Restart the desktop app to retry.`,
			);
		}
		const existing = this.instances.get(organizationId);
		if (existing) return existing;
		const pending = this.pendingStarts.get(organizationId);
		if (pending) return pending;

		const startPromise = this.start(organizationId).finally(() => {
			this.pendingStarts.delete(organizationId);
		});
		this.pendingStarts.set(organizationId, startPromise);
		return startPromise;
	}

	getSocketPath(organizationId: string): string | null {
		return this.instances.get(organizationId)?.socketPath ?? null;
	}

	async stop(organizationId: string): Promise<void> {
		const instance = this.instances.get(organizationId);
		this.instances.delete(organizationId);
		if (!instance) return;
		// Mark this exit as intentional so the on-exit handler doesn't count
		// it toward the crash circuit breaker.
		this.stopping.add(organizationId);
		try {
			process.kill(instance.pid, "SIGTERM");
		} catch {
			// Already dead.
		}
		removePtyDaemonManifest(organizationId);
	}

	private async start(organizationId: string): Promise<DaemonInstance> {
		// Try to adopt an existing daemon if its manifest is fresh and
		// process is alive and the socket is connectable.
		const adopted = await this.tryAdopt(organizationId);
		if (adopted) {
			this.instances.set(organizationId, adopted);
			console.log(
				`[pty-daemon:${organizationId}] adopted existing daemon pid=${adopted.pid}`,
			);
			return adopted;
		}

		// Otherwise spawn a fresh one.
		return this.spawn(organizationId);
	}

	private async tryAdopt(
		organizationId: string,
	): Promise<DaemonInstance | null> {
		const manifest = readPtyDaemonManifest(organizationId);
		if (!manifest) return null;
		if (!isProcessAlive(manifest.pid)) {
			removePtyDaemonManifest(organizationId);
			return null;
		}
		const reachable = await isSocketConnectable(manifest.socketPath, 1000);
		if (!reachable) {
			// PID alive but socket gone — daemon is wedged. Kill and respawn.
			try {
				process.kill(manifest.pid, "SIGTERM");
			} catch {
				// Already dead.
			}
			removePtyDaemonManifest(organizationId);
			return null;
		}
		return {
			pid: manifest.pid,
			socketPath: manifest.socketPath,
			startedAt: manifest.startedAt,
		};
	}

	private async spawn(organizationId: string): Promise<DaemonInstance> {
		const dir = ptyDaemonManifestDir(organizationId);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
		}
		const socketPath = ptyDaemonSocketPath(organizationId);
		const logPath = path.join(dir, "pty-daemon.log");

		// Sanity: refuse to spawn if the script doesn't exist (e.g. dev build
		// hasn't produced dist/main/pty-daemon.js yet). Otherwise the spawn
		// will silently exit and we wait the full timeout.
		if (!fs.existsSync(this.opts.scriptPath)) {
			throw new Error(
				`[pty-daemon:${organizationId}] script not found at ${this.opts.scriptPath} — restart electron-vite dev to bundle the new entry`,
			);
		}

		const logFd = openRotatingLogFd(logPath, MAX_HOST_LOG_BYTES);
		const stdio: childProcess.StdioOptions =
			logFd >= 0 ? ["ignore", logFd, logFd] : ["ignore", "ignore", "ignore"];

		const childEnv = {
			...(process.env as Record<string, string>),
			ELECTRON_RUN_AS_NODE: "1",
			ORGANIZATION_ID: organizationId,
			SUPERSET_HOME_DIR,
		};

		console.log(
			`[pty-daemon:${organizationId}] spawning ${this.opts.scriptPath} → ${socketPath} (log: ${logPath})`,
		);

		let child: ReturnType<typeof childProcess.spawn>;
		try {
			child = childProcess.spawn(
				process.execPath,
				[this.opts.scriptPath, `--socket=${socketPath}`],
				{
					detached: true,
					stdio,
					env: childEnv,
					windowsHide: true,
				},
			);
		} finally {
			if (logFd >= 0) {
				try {
					fs.closeSync(logFd);
				} catch {
					// best-effort
				}
			}
		}

		const childPid = child.pid;
		if (!childPid) {
			throw new Error(`[pty-daemon:${organizationId}] failed to spawn`);
		}

		// Capture an early exit so the timeout error reports the actual cause.
		let earlyExitCode: number | null = null;
		let earlyExitSignal: NodeJS.Signals | null = null;
		child.once("exit", (code, signal) => {
			earlyExitCode = code;
			earlyExitSignal = signal;
		});

		// Wait for the socket file to appear AND become connectable.
		const ready = await waitForSocket(socketPath, SOCKET_READY_TIMEOUT_MS);
		if (!ready) {
			try {
				child.kill("SIGTERM");
			} catch {
				// best-effort
			}
			let logTail = "";
			try {
				const buf = fs.readFileSync(logPath, "utf-8");
				logTail = buf.slice(-2000);
			} catch {
				logTail = "(no log file written)";
			}
			throw new Error(
				`[pty-daemon:${organizationId}] socket did not become ready within ${SOCKET_READY_TIMEOUT_MS}ms (childPid=${childPid}, earlyExit=${earlyExitCode ?? earlyExitSignal ?? "still alive"}). Log tail:\n${logTail}`,
			);
		}

		child.unref();
		child.on("exit", (code) => {
			console.log(`[pty-daemon:${organizationId}] exited with code ${code}`);
			const current = this.instances.get(organizationId);
			if (current?.pid !== childPid) return;
			this.instances.delete(organizationId);
			removePtyDaemonManifest(organizationId);

			// Was this exit intentional (we called stop)? If so, no crash
			// accounting and no respawn.
			if (this.stopping.has(organizationId)) {
				this.stopping.delete(organizationId);
				return;
			}

			// Unexpected exit — record the crash and decide whether to
			// auto-respawn or trip the circuit breaker.
			const now = Date.now();
			const recent = (this.crashTimes.get(organizationId) ?? []).filter(
				(t) => now - t < CRASH_WINDOW_MS,
			);
			recent.push(now);
			this.crashTimes.set(organizationId, recent);

			if (recent.length > CRASH_BUDGET) {
				this.circuitOpen.add(organizationId);
				console.error(
					`[pty-daemon:${organizationId}] crash circuit OPEN — ${recent.length} crashes in ${CRASH_WINDOW_MS / 1000}s; refusing further respawns until clearCrashCircuit() is called`,
				);
				return;
			}

			console.warn(
				`[pty-daemon:${organizationId}] auto-respawning after unexpected exit (${recent.length}/${CRASH_BUDGET} in window)`,
			);
			void this.ensure(organizationId).catch((err) => {
				console.error(
					`[pty-daemon:${organizationId}] auto-respawn failed:`,
					err,
				);
			});
		});

		const startedAt = Date.now();
		const manifest: PtyDaemonManifest = {
			pid: childPid,
			socketPath,
			protocolVersions: [1],
			daemonVersion: "unknown", // filled in by hello-ack on first connect
			startedAt,
			organizationId,
		};
		writePtyDaemonManifest(manifest);

		const instance: DaemonInstance = {
			pid: childPid,
			socketPath,
			startedAt,
		};
		this.instances.set(organizationId, instance);
		console.log(
			`[pty-daemon:${organizationId}] spawned pid=${childPid} socket=${socketPath}`,
		);
		return instance;
	}
}

async function waitForSocket(
	socketPath: string,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (fs.existsSync(socketPath)) {
			if (await isSocketConnectable(socketPath, 200)) return true;
		}
		await new Promise((r) => setTimeout(r, 50));
	}
	return false;
}

function isSocketConnectable(
	socketPath: string,
	timeoutMs: number,
): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const timer = setTimeout(() => {
			sock.destroy();
			resolve(false);
		}, timeoutMs);
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
