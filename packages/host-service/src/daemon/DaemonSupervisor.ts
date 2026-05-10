// DaemonSupervisor — owns the per-organization pty-daemon process for
// host-service. Spawns or adopts the daemon and exposes its socket path
// via getSocketPath(orgId). PTY ownership lives here so host-service can
// crash/restart freely without losing user shells.
//
// History: this used to live in the desktop main process
// (`apps/desktop/src/main/lib/pty-daemon-coordinator.ts`). It moved here
// so host-service can be deployed independently of Electron — see
// `apps/desktop/plans/20260430-pty-daemon-host-service-migration.md`.

import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
	isPositiveInteger,
	signalProcessTreeAndGroups,
} from "@superset/pty-daemon/process-tree";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	type ServerMessage,
	type SessionInfo,
} from "@superset/pty-daemon/protocol";
import semver from "semver";
import { DaemonClient } from "../terminal/DaemonClient/index.ts";
import { EXPECTED_DAEMON_VERSION } from "./expected-version.ts";
import { MAX_DAEMON_LOG_BYTES, openRotatingLogFd } from "./log-fd.ts";
import {
	isProcessAlive,
	type PtyDaemonManifest,
	ptyDaemonManifestDir,
	readPtyDaemonManifest,
	removePtyDaemonManifest,
	writePtyDaemonManifest,
} from "./manifest.ts";

interface DaemonInstance {
	pid: number;
	socketPath: string;
	startedAt: number;
	/** Version reported by the running daemon's hello-ack. "unknown" if probe failed. */
	runningVersion: string;
	/** Bundled-binary version we expect — i.e. EXPECTED_DAEMON_VERSION at spawn time. */
	expectedVersion: string;
	/** True when running < expected. Probe failure does NOT set this. */
	updatePending: boolean;
}

const SOCKET_READY_TIMEOUT_MS = 5_000;
const VERSION_PROBE_TIMEOUT_MS = 1_500;
const HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS = 3_000;
const HANDOFF_PROBE_TOTAL_TIMEOUT_MS = 3_000;
const DAEMON_TERMINATE_TIMEOUT_MS = 1_000;

/**
 * Crash supervision parameters. If the daemon for an organization crashes
 * more than CRASH_BUDGET times within CRASH_WINDOW_MS, we stop respawning
 * and surface a hard error — repeated crashes are a bug, not transient
 * recovery.
 */
const CRASH_BUDGET = 3;
const CRASH_WINDOW_MS = 60_000;
/** How often to poll an adopted daemon's PID for liveness. */
const ADOPTED_LIVENESS_INTERVAL_MS = 2_000;

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

/**
 * Structured log helper. Replaces the desktop's `track(...)` calls — we
 * keep the same event names + props so any future telemetry slice can
 * lift them straight back into PostHog.
 */
function logEvent(event: string, props: Record<string, unknown>): void {
	console.log(
		JSON.stringify({ component: "pty-daemon-supervisor", event, ...props }),
	);
}

export interface DaemonSupervisorOptions {
	/** Path to the daemon entry script (e.g. `dist/pty-daemon.js`). */
	scriptPath: string;
	/**
	 * When true (default), opportunistically calls `update()` after
	 * adopting a daemon whose `runningVersion < EXPECTED_DAEMON_VERSION`.
	 * Set to false in integration tests that intentionally adopt a stale
	 * daemon and assert the version-drift flag without the test racing a
	 * real handoff.
	 */
	autoUpdate?: boolean;
}

export class DaemonSupervisor {
	private readonly opts: DaemonSupervisorOptions;
	private readonly instances = new Map<string, DaemonInstance>();
	private readonly pendingStarts = new Map<string, Promise<DaemonInstance>>();
	/** Recent crash timestamps per orgId, for the circuit breaker. */
	private readonly crashTimes = new Map<string, number[]>();
	/** Orgs we've explicitly stopped — exit isn't a crash, don't respawn. */
	private readonly stopping = new Set<string>();
	/** Orgs that tripped the circuit breaker — refuse respawn until cleared. */
	private readonly circuitOpen = new Set<string>();
	/**
	 * Last (orgId → "running:expected") pair we logged update-pending for.
	 * Debounce — re-fire only when either side changes.
	 */
	private readonly lastUpdatePendingPair = new Map<string, string>();
	/**
	 * Liveness pollers per org. We only attach a `child.on("exit")` handler
	 * to daemons we *spawned* — adopted daemons (PIDs from a manifest) have
	 * no child handle, so we'd never notice if they died externally. This
	 * timer polls `process.kill(pid, 0)` to bridge that gap.
	 */
	private readonly adoptedLivenessTimers = new Map<
		string,
		ReturnType<typeof setInterval>
	>();
	/**
	 * In-flight `update()` promises per orgId. Both auto-update (on adopt
	 * with version drift) and manual update via the renderer hit the same
	 * supervisor.update() entry point — without this guard, two concurrent
	 * calls would both try to handoff a daemon that's already mid-handoff.
	 * The second caller returns the cached promise and gets the same result.
	 */
	private readonly updateInFlight = new Map<
		string,
		Promise<{ ok: true; successorPid: number } | { ok: false; reason: string }>
	>();

	constructor(opts: DaemonSupervisorOptions) {
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
	 * Reset the crash counter and close the circuit. Called from a UI
	 * "retry" action after surfacing the error to the user.
	 */
	clearCrashCircuit(organizationId: string): void {
		this.circuitOpen.delete(organizationId);
		this.crashTimes.delete(organizationId);
	}

	/**
	 * Returns whether the running daemon is older than the bundled binary.
	 * Null when we have no instance for this org. `running === "unknown"`
	 * means the version probe failed during adoption — treat as not-pending
	 * (probe failure ≠ stale).
	 */
	getUpdateStatus(
		organizationId: string,
	): { pending: boolean; running: string; expected: string } | null {
		const instance = this.instances.get(organizationId);
		if (!instance) return null;
		return {
			pending: instance.updatePending,
			running: instance.runningVersion,
			expected: instance.expectedVersion,
		};
	}

	/**
	 * Explicitly restart the daemon for an org — kills sessions, spawns
	 * fresh. The user has opted in via UI confirmation. Distinct from
	 * crash-respawn: clears the crash circuit (if open) and emits its own
	 * event so logs can separate intent from recovery.
	 *
	 * Awaits any in-flight spawn before stopping so we never SIGTERM a
	 * partially-initialized child.
	 */
	/**
	 * Phase 2: ask the running daemon to spawn a successor binary that
	 * adopts all live sessions via fd-handoff. On success the original
	 * shell PIDs survive the daemon swap.
	 *
	 * Distinct from `restart()` which kills sessions. Surface this via the
	 * "Update" UX; fall back to `restart()` only on failure.
	 */
	update(
		organizationId: string,
	): Promise<
		{ ok: true; successorPid: number } | { ok: false; reason: string }
	> {
		// Coalesce concurrent calls. Auto-update (on adopt with version
		// drift) and a manual click of the Update button can race —
		// without this guard, both would try to handoff the same daemon.
		// The second caller observes the same outcome via the cached
		// promise.
		const inFlight = this.updateInFlight.get(organizationId);
		if (inFlight) return inFlight;
		const promise = this.runUpdate(organizationId).finally(() => {
			this.updateInFlight.delete(organizationId);
		});
		this.updateInFlight.set(organizationId, promise);
		return promise;
	}

	private async runUpdate(
		organizationId: string,
	): Promise<
		{ ok: true; successorPid: number } | { ok: false; reason: string }
	> {
		const instance = this.instances.get(organizationId);
		if (!instance) {
			return { ok: false, reason: "no daemon running for this org" };
		}

		// Suppress crash-respawn for the predecessor's imminent exit. The
		// predecessor was either spawned by us (child.on('exit') will fire)
		// or adopted (liveness poll); either way, marking `stopping` makes
		// the exit handler treat it as expected.
		this.stopping.add(organizationId);
		this.stopAdoptedLivenessCheck(organizationId);

		// Mark the manifest so a host-service crash mid-handoff is
		// debuggable. We restore on failure or replace on success.
		const existingManifest = readPtyDaemonManifest(organizationId);
		if (existingManifest) {
			writePtyDaemonManifest({
				...existingManifest,
				handoffInProgress: true,
			});
		}

		const restoreOnFailure = () => {
			this.stopping.delete(organizationId);
			if (existingManifest) writePtyDaemonManifest(existingManifest);
			// Re-arm liveness for the (still-living) predecessor.
			this.startAdoptedLivenessCheck(organizationId, instance.pid);
		};

		const client = new DaemonClient({ socketPath: instance.socketPath });
		let result:
			| { ok: true; successorPid: number }
			| { ok: false; reason: string };
		try {
			await client.connect();
			result = await client.prepareUpgrade();
		} catch (err) {
			restoreOnFailure();
			return {
				ok: false,
				reason: `prepareUpgrade transport: ${(err as Error).message}`,
			};
		} finally {
			await client.dispose();
		}

		if (!result.ok) {
			restoreOnFailure();
			return result;
		}

		// Gate the probe on predecessor exit — see waitForPidExit's docstring
		// for the race it guards against.
		let predecessorExited = await waitForPidExit(
			instance.pid,
			HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS,
		);
		if (!predecessorExited) {
			logEvent("pty_daemon_update_predecessor_escalate", {
				organizationId,
				predecessorPid: instance.pid,
				successorPid: result.successorPid,
				timeoutMs: HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS,
			});
			terminatePidOnly(instance.pid, "SIGKILL");
			predecessorExited = await waitForPidExit(
				instance.pid,
				DAEMON_TERMINATE_TIMEOUT_MS,
			);
			if (!predecessorExited) {
				restoreOnFailure();
				return {
					ok: false,
					reason: `predecessor pid ${instance.pid} did not exit within ${HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS + DAEMON_TERMINATE_TIMEOUT_MS}ms after handoff ack`,
				};
			}
		}

		const probedVersion = await probeDaemonVersionWithRetry(
			instance.socketPath,
			HANDOFF_PROBE_TOTAL_TIMEOUT_MS,
		);
		const runningVersion = probedVersion ?? "unknown";

		// Single capture so the in-memory instance and the manifest agree.
		const successorStartedAt = Date.now();
		const successorInstance: DaemonInstance = {
			pid: result.successorPid,
			socketPath: instance.socketPath,
			startedAt: successorStartedAt,
			runningVersion,
			expectedVersion: EXPECTED_DAEMON_VERSION,
			updatePending:
				!!probedVersion &&
				!semver.satisfies(probedVersion, `>=${EXPECTED_DAEMON_VERSION}`),
		};
		this.instances.set(organizationId, successorInstance);
		this.stopping.delete(organizationId);
		this.lastUpdatePendingPair.delete(organizationId);

		if (existingManifest) {
			writePtyDaemonManifest({
				pid: result.successorPid,
				socketPath: instance.socketPath,
				protocolVersions: existingManifest.protocolVersions,
				startedAt: successorStartedAt,
				organizationId,
			});
		}

		// Successor wasn't spawned as our child — start liveness polling.
		this.startAdoptedLivenessCheck(organizationId, result.successorPid);

		logEvent("pty_daemon_update", {
			organizationId,
			previousPid: instance.pid,
			successorPid: result.successorPid,
			previousVersion: instance.runningVersion,
			successorVersion: runningVersion,
		});

		return { ok: true, successorPid: result.successorPid };
	}

	async restart(organizationId: string): Promise<{ success: true }> {
		const prev = this.instances.get(organizationId);
		const hadCircuitOpen = this.circuitOpen.has(organizationId);

		const pending = this.pendingStarts.get(organizationId);
		if (pending) {
			try {
				await pending;
			} catch {
				// Failed in-flight spawn — nothing to stop, ensure() will retry.
			}
		}

		await this.stop(organizationId);
		this.clearCrashCircuit(organizationId);

		logEvent("pty_daemon_user_restart", {
			organizationId,
			hadCircuitOpen,
			previousRunningVersion: prev?.runningVersion ?? null,
			previousExpectedVersion: prev?.expectedVersion ?? null,
			previousUpdatePending: prev?.updatePending ?? null,
		});

		await this.ensure(organizationId);
		return { success: true };
	}

	/**
	 * Spawn the daemon if not already running for this organization, or
	 * adopt the running one. Returns the instance metadata.
	 */
	async ensure(organizationId: string): Promise<DaemonInstance> {
		if (this.circuitOpen.has(organizationId)) {
			throw new Error(
				`[pty-daemon:${organizationId}] crash circuit open: ${CRASH_BUDGET} crashes within ${CRASH_WINDOW_MS / 1000}s. Restart the host-service to retry.`,
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

	/**
	 * Live session list from the running daemon. Null when there is no
	 * daemon for the org, the socket is unreachable, or the request times
	 * out — the caller treats null as "unknown" (distinct from `[]` which
	 * means "daemon up, no sessions").
	 */
	async listSessions(
		organizationId: string,
		timeoutMs = 1500,
	): Promise<SessionInfo[] | null> {
		const socketPath = this.getSocketPath(organizationId);
		if (!socketPath) return null;
		return listDaemonSessions(socketPath, timeoutMs);
	}

	async stop(organizationId: string): Promise<void> {
		const instance = this.instances.get(organizationId);
		this.instances.delete(organizationId);
		this.stopAdoptedLivenessCheck(organizationId);
		if (!instance) return;
		this.stopping.add(organizationId);
		await terminateProcessTreeAndGroups(instance.pid, "SIGTERM");
		removePtyDaemonManifest(organizationId);
	}

	/**
	 * Poll an adopted daemon's liveness. Adopted daemons are PIDs we
	 * inherited via the manifest — we never spawned them as a child, so
	 * `child.on("exit")` doesn't fire when they die. Without this poller
	 * the supervisor's `instances` map carries a stale entry forever:
	 * `getSocketPath` returns a socket nobody's listening on, terminal
	 * ops fail with "ECONNREFUSED" until something forces a restart.
	 *
	 * On detected death: clear the instance + manifest so the next
	 * `ensure()` call respawns.
	 */
	private startAdoptedLivenessCheck(organizationId: string, pid: number): void {
		this.stopAdoptedLivenessCheck(organizationId);
		const timer = setInterval(() => {
			if (isProcessAlive(pid)) return;
			console.log(
				`[pty-daemon:${organizationId}] adopted process ${pid} died — clearing instance for next-ensure respawn`,
			);
			this.stopAdoptedLivenessCheck(organizationId);
			const current = this.instances.get(organizationId);
			if (current?.pid === pid) {
				this.instances.delete(organizationId);
				removePtyDaemonManifest(organizationId);
			}
		}, ADOPTED_LIVENESS_INTERVAL_MS);
		this.adoptedLivenessTimers.set(organizationId, timer);
	}

	private stopAdoptedLivenessCheck(organizationId: string): void {
		const timer = this.adoptedLivenessTimers.get(organizationId);
		if (timer) {
			clearInterval(timer);
			this.adoptedLivenessTimers.delete(organizationId);
		}
	}

	/**
	 * Auto-update: best-effort opportunistic handoff when the adopted
	 * daemon is older than the bundled binary. Runs after host-service
	 * boot, fire-and-track, doesn't block anything. On failure we leave
	 * the old daemon running — the user keeps their sessions and can
	 * retry via the Update button. The renderer's "Update available"
	 * badge still shows in that case, which is correct: the upgrade
	 * truly is still pending.
	 */
	private kickoffAutoUpdate(
		organizationId: string,
		instance: DaemonInstance,
	): void {
		logEvent("pty_daemon_auto_update_attempt", {
			organizationId,
			runningVersion: instance.runningVersion,
			expectedVersion: instance.expectedVersion,
			pid: instance.pid,
		});
		void this.update(organizationId).then(
			(result) => {
				if (result.ok) {
					logEvent("pty_daemon_auto_update_ok", {
						organizationId,
						previousPid: instance.pid,
						successorPid: result.successorPid,
						previousVersion: instance.runningVersion,
					});
				} else {
					logEvent("pty_daemon_auto_update_failed", {
						organizationId,
						pid: instance.pid,
						runningVersion: instance.runningVersion,
						expectedVersion: instance.expectedVersion,
						reason: result.reason,
					});
				}
			},
			(err) => {
				logEvent("pty_daemon_auto_update_failed", {
					organizationId,
					pid: instance.pid,
					runningVersion: instance.runningVersion,
					expectedVersion: instance.expectedVersion,
					reason: `threw: ${(err as Error).message}`,
				});
			},
		);
	}

	/**
	 * Dev-only: SIGTERM any existing daemon for this org so the next
	 * adopt-or-spawn always lands on a fresh daemon process. Reads
	 * the manifest (the only persistent record of "a daemon exists") —
	 * if pid is alive, sends SIGTERM and waits up to 1s for it to exit.
	 * If still alive, escalates to SIGKILL. Either way we remove the
	 * manifest so tryAdopt sees a clean slate.
	 *
	 * Idempotent — safe to call when no daemon is running.
	 */
	private async killStaleDaemonForDev(organizationId: string): Promise<void> {
		const manifest = readPtyDaemonManifest(organizationId);
		if (!manifest) return;
		if (!isProcessAlive(manifest.pid)) {
			removePtyDaemonManifest(organizationId);
			return;
		}
		console.log(
			`[pty-daemon:${organizationId}] DEV: killing leftover daemon pid=${manifest.pid} (started ${Math.round((Date.now() - manifest.startedAt) / 1000)}s ago) so the next bootstrap picks up fresh bundle code`,
		);
		await terminateProcessTreeAndGroups(manifest.pid, "SIGTERM");
		removePtyDaemonManifest(organizationId);
	}

	private async start(organizationId: string): Promise<DaemonInstance> {
		// Dev mode: never adopt. A leftover detached daemon from a previous
		// `bun dev` session would mask code changes — devs hit Update or
		// open a session and see stale-bundle behavior with no obvious
		// reason. Kill any running daemon for the org and spawn fresh.
		// Production keeps the adopt path so PTY sessions survive
		// host-service restarts (the original Phase 1 promise).
		if (process.env.NODE_ENV !== "production") {
			await this.killStaleDaemonForDev(organizationId);
		}

		const adopted = await this.tryAdopt(organizationId);
		if (adopted) {
			this.instances.set(organizationId, adopted);
			console.log(
				`[pty-daemon:${organizationId}] adopted existing daemon pid=${adopted.pid} runningVersion=${adopted.runningVersion} updatePending=${adopted.updatePending}`,
			);
			logEvent("pty_daemon_adopt", {
				organizationId,
				pid: adopted.pid,
				ageSeconds: Math.round((Date.now() - adopted.startedAt) / 1000),
				runningVersion: adopted.runningVersion,
				expectedVersion: adopted.expectedVersion,
				updatePending: adopted.updatePending,
			});
			this.maybeFireUpdatePending(organizationId, adopted);
			this.startAdoptedLivenessCheck(organizationId, adopted.pid);
			// Auto-update opportunistically: if the adopted daemon is older
			// than the bundled binary, kick off a handoff in the background.
			// Sessions survive on success; on failure we leave the old
			// daemon running and the user can retry via the Update button.
			// Fire-and-track so bootstrap returns immediately.
			if (adopted.updatePending && this.opts.autoUpdate !== false) {
				this.kickoffAutoUpdate(organizationId, adopted);
			}
			return adopted;
		}

		const instance = await this.spawn(organizationId);
		logEvent("pty_daemon_spawn", {
			organizationId,
			pid: instance.pid,
			socketPath: instance.socketPath,
			daemonVersion: instance.runningVersion,
		});
		this.lastUpdatePendingPair.delete(organizationId);
		return instance;
	}

	/**
	 * Log `pty_daemon_update_pending` once per (running, expected) pair so
	 * adopting the same stale daemon repeatedly doesn't spam logs.
	 */
	private maybeFireUpdatePending(
		organizationId: string,
		instance: DaemonInstance,
	): void {
		if (!instance.updatePending) {
			this.lastUpdatePendingPair.delete(organizationId);
			return;
		}
		const pair = `${instance.runningVersion}:${instance.expectedVersion}`;
		if (this.lastUpdatePendingPair.get(organizationId) === pair) return;
		this.lastUpdatePendingPair.set(organizationId, pair);
		logEvent("pty_daemon_update_pending", {
			organizationId,
			runningVersion: instance.runningVersion,
			expectedVersion: instance.expectedVersion,
		});
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
			await terminateProcessTreeAndGroups(manifest.pid, "SIGTERM");
			removePtyDaemonManifest(organizationId);
			return null;
		}

		const probed = await probeDaemonVersion(
			manifest.socketPath,
			VERSION_PROBE_TIMEOUT_MS,
		);
		const runningVersion = probed ?? "unknown";
		const updatePending =
			!!probed && !semver.satisfies(probed, `>=${EXPECTED_DAEMON_VERSION}`);

		return {
			pid: manifest.pid,
			socketPath: manifest.socketPath,
			startedAt: manifest.startedAt,
			runningVersion,
			expectedVersion: EXPECTED_DAEMON_VERSION,
			updatePending,
		};
	}

	private async spawn(organizationId: string): Promise<DaemonInstance> {
		const dir = ptyDaemonManifestDir(organizationId);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
		}
		const socketPath = ptyDaemonSocketPath(organizationId);
		const logPath = path.join(dir, "pty-daemon.log");

		if (!fs.existsSync(this.opts.scriptPath)) {
			throw new Error(
				`[pty-daemon:${organizationId}] script not found at ${this.opts.scriptPath} — has the daemon binary been bundled?`,
			);
		}

		// Dev: pipe daemon stdout/stderr through host-service so log lines
		// flow up to the developer's `bun dev` terminal. Production:
		// hard-back stdio with the rotating log file so the detached
		// daemon survives host-service teardown without losing logs.
		const isDev = process.env.NODE_ENV !== "production";
		const logFd = isDev ? -1 : openRotatingLogFd(logPath, MAX_DAEMON_LOG_BYTES);
		const stdio: childProcess.StdioOptions = isDev
			? ["ignore", "pipe", "pipe"]
			: logFd >= 0
				? ["ignore", logFd, logFd]
				: ["ignore", "ignore", "ignore"];

		const childEnv = {
			...(process.env as Record<string, string>),
			ORGANIZATION_ID: organizationId,
			// Source of truth for daemon version. The daemon's main.ts reads
			// this and surfaces it in the hello-ack so adoption probes can
			// detect drift against EXPECTED_DAEMON_VERSION.
			SUPERSET_PTY_DAEMON_VERSION: EXPECTED_DAEMON_VERSION,
		};

		console.log(
			`[pty-daemon:${organizationId}] spawning ${this.opts.scriptPath} → ${socketPath} (log: ${logPath})`,
		);

		let child: ReturnType<typeof childProcess.spawn>;
		try {
			// Prod: detached so PTYs survive host-service restarts via socket
			// adoption. Dev: attached as defense-in-depth in case serve.ts's
			// dev shutdown doesn't fire (e.g. host-service crash).
			child = childProcess.spawn(
				process.execPath,
				[this.opts.scriptPath, `--socket=${socketPath}`],
				{
					detached: !isDev,
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

		// Dev: fan daemon stdout/stderr up to host-service stdout (which
		// itself flows up to `bun dev`). Production stdio is backed by the
		// rotating log file already (logFd above), so no fan-out needed.
		if (isDev && child.stdout && child.stderr) {
			const tag = `[ptyd:${organizationId.slice(0, 8)}]`;
			pipeWithPrefix(child.stdout, process.stdout, tag);
			pipeWithPrefix(child.stderr, process.stderr, tag);
		}

		let earlyExitCode: number | null = null;
		let earlyExitSignal: NodeJS.Signals | null = null;
		child.once("exit", (code, signal) => {
			earlyExitCode = code;
			earlyExitSignal = signal;
		});

		const ready = await waitForSocket(socketPath, SOCKET_READY_TIMEOUT_MS);
		if (!ready) {
			await terminateProcessTreeAndGroups(childPid, "SIGTERM");
			let logTail = "";
			try {
				const buf = fs.readFileSync(logPath, "utf-8");
				logTail = buf.slice(-2000);
			} catch {
				logTail = "(no log file written)";
			}
			logEvent("pty_daemon_spawn_failed", {
				organizationId,
				reason: "socket-not-ready",
				timeoutMs: SOCKET_READY_TIMEOUT_MS,
				earlyExitCode,
				earlyExitSignal,
			});
			throw new Error(
				`[pty-daemon:${organizationId}] socket did not become ready within ${SOCKET_READY_TIMEOUT_MS}ms (childPid=${childPid}, earlyExit=${earlyExitCode ?? earlyExitSignal ?? "still alive"}). Log tail:\n${logTail}`,
			);
		}

		if (!isDev) child.unref();
		child.on("exit", (code) => {
			console.log(`[pty-daemon:${organizationId}] exited with code ${code}`);
			const current = this.instances.get(organizationId);
			if (current?.pid !== childPid) return;
			this.instances.delete(organizationId);
			removePtyDaemonManifest(organizationId);

			if (this.stopping.has(organizationId)) {
				this.stopping.delete(organizationId);
				return;
			}

			const now = Date.now();
			const recent = (this.crashTimes.get(organizationId) ?? []).filter(
				(t) => now - t < CRASH_WINDOW_MS,
			);
			recent.push(now);
			this.crashTimes.set(organizationId, recent);

			logEvent("pty_daemon_crash", {
				organizationId,
				exitCode: code,
				crashesInWindow: recent.length,
				windowSeconds: CRASH_WINDOW_MS / 1000,
				ageSeconds: Math.round((now - current.startedAt) / 1000),
			});

			if (recent.length > CRASH_BUDGET) {
				this.circuitOpen.add(organizationId);
				console.error(
					`[pty-daemon:${organizationId}] crash circuit OPEN — ${recent.length} crashes in ${CRASH_WINDOW_MS / 1000}s; refusing further respawns until clearCrashCircuit() is called`,
				);
				logEvent("pty_daemon_circuit_open", {
					organizationId,
					crashesInWindow: recent.length,
				});
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
			startedAt,
			organizationId,
		};
		writePtyDaemonManifest(manifest);

		const instance: DaemonInstance = {
			pid: childPid,
			socketPath,
			startedAt,
			runningVersion: EXPECTED_DAEMON_VERSION,
			expectedVersion: EXPECTED_DAEMON_VERSION,
			updatePending: false,
		};
		this.instances.set(organizationId, instance);
		console.log(
			`[pty-daemon:${organizationId}] spawned pid=${childPid} socket=${socketPath}`,
		);
		return instance;
	}
}

/**
 * Forward child stdout/stderr to a parent stream with a per-line prefix.
 * Plain `chunk => parent.write(`${tag} ${chunk}`)` only prefixes the first
 * line in a chunk; bursts of multi-line output lose the prefix on
 * subsequent lines.
 */
function pipeWithPrefix(
	source: NodeJS.ReadableStream,
	target: NodeJS.WritableStream,
	tag: string,
): void {
	let pending = "";
	source.on("data", (chunk: Buffer) => {
		const text = pending + chunk.toString("utf8");
		const lines = text.split("\n");
		pending = lines.pop() ?? "";
		for (const line of lines) {
			target.write(`${tag} ${line}\n`);
		}
	});
	source.on("end", () => {
		if (pending) target.write(`${tag} ${pending}\n`);
		pending = "";
	});
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

/**
 * One-shot session list: connect, do handshake, send `list`, return the
 * sessions array. Returns null on any failure.
 *
 * Owns its socket lifecycle on every exit path.
 */
export async function listDaemonSessions(
	socketPath: string,
	timeoutMs: number,
): Promise<SessionInfo[] | null> {
	return new Promise<SessionInfo[] | null>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const decoder = new FrameDecoder();
		let helloAcked = false;
		let settled = false;

		const cleanup = (value: SessionInfo[] | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			sock.removeAllListeners();
			try {
				sock.end();
			} catch {
				// best-effort
			}
			try {
				sock.destroy();
			} catch {
				// best-effort
			}
			resolve(value);
		};

		const timer = setTimeout(() => cleanup(null), timeoutMs);

		sock.once("error", () => cleanup(null));
		sock.once("close", () => cleanup(null));

		sock.once("connect", () => {
			try {
				sock.write(
					encodeFrame({
						type: "hello",
						protocols: [CURRENT_PROTOCOL_VERSION],
						clientVersion: "supervisor-list",
					}),
				);
			} catch {
				cleanup(null);
			}
		});

		sock.on("data", (chunk: Buffer) => {
			try {
				decoder.push(chunk);
				for (const decoded of decoder.drain()) {
					const msg = decoded.message as ServerMessage;
					if (!helloAcked) {
						if (msg.type !== "hello-ack") {
							cleanup(null);
							return;
						}
						helloAcked = true;
						sock.write(encodeFrame({ type: "list" }));
						continue;
					}
					if (msg.type === "list-reply") {
						cleanup(msg.sessions);
						return;
					}
					if (msg.type === "error") {
						cleanup(null);
						return;
					}
				}
			} catch {
				cleanup(null);
			}
		});
	});
}

/**
 * Retry probeDaemonVersion through the post-handoff bind window. The
 * successor calls `listenWithRetry` only after the predecessor's IPC
 * channel disconnects (= predecessor exited), so there's a brief gap
 * between predecessor death and successor bind where any probe sees
 * ECONNREFUSED. A single probe with a long timeout still fails because
 * `probeDaemonVersion` resolves to null on the first connect-error;
 * we have to actively retry.
 */
async function probeDaemonVersionWithRetry(
	socketPath: string,
	totalTimeoutMs: number,
): Promise<string | null> {
	const deadline = Date.now() + totalTimeoutMs;
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		const perAttempt = Math.min(remaining, VERSION_PROBE_TIMEOUT_MS);
		const v = await probeDaemonVersion(socketPath, perAttempt);
		if (v !== null) return v;
		await new Promise((r) => setTimeout(r, 50));
	}
	return null;
}

function terminatePidOnly(pid: number, signal: NodeJS.Signals): void {
	if (!isPositiveInteger(pid)) return;
	try {
		process.kill(pid, signal);
	} catch {
		// Already dead or not ours.
	}
}

async function terminateProcessTreeAndGroups(
	pid: number,
	signal: NodeJS.Signals,
): Promise<void> {
	if (!isPositiveInteger(pid)) return;
	signalProcessTreeAndGroups(pid, signal);
	if (await waitForPidExit(pid, DAEMON_TERMINATE_TIMEOUT_MS)) return;
	signalProcessTreeAndGroups(pid, "SIGKILL");
	await waitForPidExit(pid, DAEMON_TERMINATE_TIMEOUT_MS);
}

/**
 * Poll `kill(pid, 0)` until the process is gone or the deadline hits.
 * Returns `true` if we observed exit, `false` on timeout. Used to gate
 * a post-handoff version probe on predecessor exit — without this gate,
 * the probe can connect to the still-alive predecessor and record its
 * (old) version as the successor's, leaving updatePending true.
 *
 * On timeout the caller should treat the update as failed: the predecessor
 * is wedged, we can't reliably tell whether the successor bound, and
 * pretending to succeed would silently corrupt the supervisor's view.
 */
async function waitForPidExit(
	pid: number,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ESRCH") return true;
			// EPERM: process exists but isn't ours — keep waiting.
		}
		await new Promise((r) => setTimeout(r, 25));
	}
	return false;
}

/**
 * One-shot version probe: connect, send `hello`, read framed `hello-ack`,
 * close, return `daemonVersion`. Returns null on any failure.
 *
 * Owns its socket lifecycle on every exit path.
 */
export async function probeDaemonVersion(
	socketPath: string,
	timeoutMs: number,
): Promise<string | null> {
	return new Promise<string | null>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const decoder = new FrameDecoder();
		let settled = false;

		const cleanup = (value: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			sock.removeAllListeners();
			try {
				sock.end();
			} catch {
				// best-effort
			}
			try {
				sock.destroy();
			} catch {
				// best-effort
			}
			resolve(value);
		};

		const timer = setTimeout(() => cleanup(null), timeoutMs);

		sock.once("error", () => cleanup(null));
		sock.once("close", () => cleanup(null));

		sock.once("connect", () => {
			try {
				sock.write(
					encodeFrame({
						type: "hello",
						protocols: [CURRENT_PROTOCOL_VERSION],
						clientVersion: "supervisor-probe",
					}),
				);
			} catch {
				cleanup(null);
			}
		});

		sock.on("data", (chunk: Buffer) => {
			try {
				decoder.push(chunk);
				for (const decoded of decoder.drain()) {
					const msg = decoded.message as ServerMessage;
					if (msg.type === "hello-ack") {
						cleanup(msg.daemonVersion ?? null);
						return;
					}
					cleanup(null);
					return;
				}
			} catch {
				cleanup(null);
			}
		});
	});
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
