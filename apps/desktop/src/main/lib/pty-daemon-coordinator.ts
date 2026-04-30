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
import * as fs from "node:fs";
import * as net from "node:net";
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
 * Per-organization socket path. Owner-only directory inherits from the
 * existing $SUPERSET_HOME_DIR/host/{orgId}/ tree.
 */
function ptyDaemonSocketPath(organizationId: string): string {
	return path.join(ptyDaemonManifestDir(organizationId), "pty-daemon.sock");
}

export interface PtyDaemonCoordinatorOptions {
	/** Path to the daemon entry script (e.g. dist/pty-daemon.js). */
	scriptPath: string;
}

export class PtyDaemonCoordinator {
	private readonly opts: PtyDaemonCoordinatorOptions;
	private readonly instances = new Map<string, DaemonInstance>();
	private readonly pendingStarts = new Map<string, Promise<DaemonInstance>>();

	constructor(opts: PtyDaemonCoordinatorOptions) {
		this.opts = opts;
	}

	/**
	 * Spawn the daemon if not already running for this organization, or
	 * adopt the running one. Returns the socket path host-service should
	 * connect to.
	 */
	async ensure(organizationId: string): Promise<DaemonInstance> {
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

		const logFd = openRotatingLogFd(
			path.join(dir, "pty-daemon.log"),
			MAX_HOST_LOG_BYTES,
		);
		const stdio: childProcess.StdioOptions =
			logFd >= 0 ? ["ignore", logFd, logFd] : ["ignore", "ignore", "ignore"];

		const childEnv = {
			...(process.env as Record<string, string>),
			ELECTRON_RUN_AS_NODE: "1",
			ORGANIZATION_ID: organizationId,
			SUPERSET_HOME_DIR,
		};

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

		// Wait for the socket file to appear AND become connectable.
		const ready = await waitForSocket(socketPath, SOCKET_READY_TIMEOUT_MS);
		if (!ready) {
			try {
				child.kill("SIGTERM");
			} catch {
				// best-effort
			}
			throw new Error(
				`[pty-daemon:${organizationId}] socket did not become ready within ${SOCKET_READY_TIMEOUT_MS}ms`,
			);
		}

		child.unref();
		child.on("exit", (code) => {
			console.log(`[pty-daemon:${organizationId}] exited with code ${code}`);
			const current = this.instances.get(organizationId);
			if (current?.pid === childPid) {
				this.instances.delete(organizationId);
				removePtyDaemonManifest(organizationId);
			}
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
