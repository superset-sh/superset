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
	captureProcessIdentity,
	isPositiveInteger,
	type ProcessIdentity,
	type ProcessInfo,
	type ProcessSignalTarget,
	processIdentityMatches,
	processIdentitySignalTarget,
	readProcessTable,
	sameProcessIdentity,
	signalProcessTargetsIfStillOwned,
	signalProcessTreeAndGroups,
	signalProcessTreeAndGroupsIfStillOwned,
} from "@superset/pty-daemon/process-tree";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	LOSSLESS_LIVE_HANDOFF_CAPABILITY,
	type ServerMessage,
	type SessionInfo,
} from "@superset/pty-daemon/protocol";
import semver from "semver";
import {
	DaemonClient,
	type UpgradePreparedResult,
} from "../terminal/DaemonClient/index.ts";
import {
	beginDaemonUpdate,
	type DaemonUpdateMutationLease,
} from "../terminal/daemon-mutation-gate.ts";
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
	/** Exact lifetime captured from a child spawned for ambiguous recovery. */
	spawnIdentity?: ProcessIdentity;
	/** Version reported by the running daemon's hello-ack. "unknown" if probe failed. */
	runningVersion: string;
	/** Bundled-binary version we expect — i.e. EXPECTED_DAEMON_VERSION at spawn time. */
	expectedVersion: string;
	/** True when running < expected. Probe failure does NOT set this. */
	updatePending: boolean;
	/** Last failed background update attempt for this still-running daemon. */
	autoUpdateFailure?: DaemonAutoUpdateFailure;
}

interface DaemonProbeResult {
	daemonVersion: string;
	daemonPid?: number;
	capabilities: string[];
}

export function liveHandoffCapabilityFailure(
	sessions: SessionInfo[],
	hasLosslessCapability: boolean,
): string | null {
	const liveSessions = sessions.filter((session) => session.alive);
	if (liveSessions.length === 0 || hasLosslessCapability) return null;
	return `running daemon lacks ${LOSSLESS_LIVE_HANDOFF_CAPABILITY}; refusing to hand off ${liveSessions.length} live terminal session${liveSessions.length === 1 ? "" : "s"}`;
}

interface AmbiguousUpdateRecovery {
	lease: DaemonUpdateMutationLease;
	predecessor: ProcessIdentity;
	successor?: ProcessIdentity;
	socketPath: string;
}

interface AmbiguousOwnerEliminationOptions {
	readCurrentProcessTable?: () => ProcessInfo[];
	isPidAlive?: (pid: number) => boolean;
	identityExitTimeoutMs?: number;
	probeOwner?: (
		socketPath: string,
		timeoutMs: number,
	) => Promise<VerifiedDaemonOwner | null>;
	now?: () => number;
	sleep?: (timeoutMs: number) => Promise<void>;
	probeWindowMs?: number;
}

/**
 * Only a new daemon's explicit predecessor verdict can reopen the mutation
 * gate. Legacy daemons omit `ownership`; that outcome is intentionally
 * ambiguous because the failure reply may race a committed successor.
 */
export function upgradeFailureCanResumePredecessor(
	result: Extract<UpgradePreparedResult, { ok: false }>,
): boolean {
	return result.ownership === "predecessor";
}

export interface DaemonAutoUpdateFailure {
	id: string;
	reason: string;
	failedAt: number;
}

export interface DaemonUpdateStatus {
	pending: boolean;
	running: string;
	expected: string;
	autoUpdateFailure: DaemonAutoUpdateFailure | null;
}

const SOCKET_READY_TIMEOUT_MS = 5_000;
const VERSION_PROBE_TIMEOUT_MS = 1_500;
const HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS = 3_000;
const HANDOFF_PROBE_TOTAL_TIMEOUT_MS = 3_000;
const DAEMON_TERMINATE_TIMEOUT_MS = 1_000;
const AUTO_UPDATE_SESSION_LIST_TIMEOUT_MS = 1_500;
const ADOPTION_PROBE_TOTAL_TIMEOUT_MS = 3_000;

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
const ADOPT_IN_DEV_ENV = "SUPERSET_PTY_DAEMON_ADOPT_IN_DEV";

export function shouldKillStaleDaemonForDev(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (env[ADOPT_IN_DEV_ENV] === "1") return false;
	return env.NODE_ENV === "development";
}

/**
 * Per-instance socket path. **Must stay short** — Darwin's `sun_path`
 * is 104 bytes, and `$SUPERSET_HOME_DIR/host/{orgId}/pty-daemon.sock` blows
 * past that in dev (worktree-relative SUPERSET_HOME_DIR + 36-char UUID), so
 * the socket lives in `os.tmpdir()` under a fixed-length hash. Owner-only
 * file mode (0600, set by the daemon's Server.listen) is the auth boundary;
 * the directory permissions don't matter.
 *
 * Development manifests are per-home, so a home-agnostic socket lets a dev
 * instance adopt the packaged app's daemon through the manifest-missing
 * socket-probe fallback. Namespace only development worktrees with a
 * non-default `SUPERSET_HOME_DIR`; all production paths deliberately keep the
 * legacy org-only socket so existing packaged daemons remain adoptable.
 */
export function ptyDaemonSocketPath(
	organizationId: string,
	env: NodeJS.ProcessEnv = process.env,
): string {
	const home = env.SUPERSET_HOME_DIR;
	const defaultHome = path.join(os.homedir(), ".superset");
	const isDefaultHome =
		!home || path.resolve(home) === path.resolve(defaultHome);
	const key =
		env.NODE_ENV === "development" && !isDefaultHome
			? `${organizationId}:${home}`
			: organizationId;
	const shortId = createHash("sha256").update(key).digest("hex").slice(0, 12);
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
	 * Background auto-update is best-effort only: a capable daemon may hand off
	 * live sessions losslessly, while legacy/unknown daemons defer until idle.
	 * On any failure the predecessor keeps running; only the desktop UI exposes
	 * the explicit destructive force restart.
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
	/** Ambiguous recovery must spawn a new child and may never adopt a late binder. */
	private readonly spawnOnlyOrganizations = new Set<string>();
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
	/** Held fail-closed when prepare-upgrade ownership could not be proven. */
	private readonly ambiguousUpdates = new Map<
		string,
		AmbiguousUpdateRecovery
	>();
	/** Destructive restarts serialize with smooth updates for the same org. */
	private readonly restartInFlight = new Map<
		string,
		Promise<{ success: true }>
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
	getUpdateStatus(organizationId: string): DaemonUpdateStatus | null {
		const instance = this.instances.get(organizationId);
		if (!instance) return null;
		return {
			pending: instance.updatePending,
			running: instance.runningVersion,
			expected: instance.expectedVersion,
			autoUpdateFailure: instance.autoUpdateFailure ?? null,
		};
	}

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
		return this.startUpdate(organizationId).promise;
	}

	private startUpdate(organizationId: string): {
		promise: Promise<
			{ ok: true; successorPid: number } | { ok: false; reason: string }
		>;
		started: boolean;
	} {
		if (this.restartInFlight.has(organizationId)) {
			return {
				promise: Promise.resolve({
					ok: false,
					reason: "pty-daemon restart is already in progress",
				}),
				started: false,
			};
		}
		// Coalesce concurrent calls. Auto-update (on adopt with version
		// drift) and a manual click of the Update button can race —
		// without this guard, both would try to handoff the same daemon.
		// The second caller observes the same outcome via the cached
		// promise.
		const inFlight = this.updateInFlight.get(organizationId);
		if (inFlight) return { promise: inFlight, started: false };
		const promise = this.runUpdate(organizationId).finally(() => {
			this.updateInFlight.delete(organizationId);
		});
		this.updateInFlight.set(organizationId, promise);
		return { promise, started: true };
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
		const mutationLease = beginDaemonUpdate(organizationId);
		try {
			// beginDaemonUpdate() closed the writer gate synchronously. Waiting
			// here drains operations already in flight and performs a request/reply
			// barrier on the cached mutation socket before the supervisor's
			// separate control-plane socket asks for a snapshot.
			await mutationLease.waitUntilDrained();
		} catch (error) {
			await mutationLease.release("abort");
			return {
				ok: false,
				reason: `failed to quiesce terminal mutations: ${(error as Error).message}`,
			};
		}

		// Re-list on the same control socket that will send prepare-upgrade. The
		// writer gate is already closed and the mutation socket barrier completed,
		// so this is a stable view: opens arriving now are queued for the eventual
		// owner instead of entering an unadvertised legacy snapshot.
		const client = new DaemonClient({ socketPath: instance.socketPath });
		let preflightSessions: SessionInfo[];
		try {
			await client.connect();
			preflightSessions = await client.list();
		} catch (error) {
			await client.dispose().catch(() => {});
			await mutationLease.release("abort");
			return {
				ok: false,
				reason: `failed to verify live-handoff capability: ${(error as Error).message}`,
			};
		}
		const capabilityFailure = liveHandoffCapabilityFailure(
			preflightSessions,
			client.hasCapability(LOSSLESS_LIVE_HANDOFF_CAPABILITY),
		);
		if (capabilityFailure) {
			await client.dispose().catch(() => {});
			await mutationLease.release("abort");
			return { ok: false, reason: capabilityFailure };
		}
		// A numeric PID is not a durable ownership proof across the asynchronous
		// handoff window. Capture the predecessor lifetime immediately before the
		// first state transition that can commit ownership elsewhere.
		const predecessorIdentity = captureProcessIdentity(instance.pid);
		if (!predecessorIdentity) {
			await client.dispose().catch(() => {});
			await mutationLease.release("abort");
			return {
				ok: false,
				reason: `failed to capture predecessor process identity ${instance.pid}`,
			};
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
		const restoreOnFailure = () => {
			this.stopping.delete(organizationId);
			// Re-arm liveness for the (still-living) predecessor.
			this.startAdoptedLivenessCheck(organizationId, instance.pid);
			if (existingManifest) writePtyDaemonManifest(existingManifest);
		};

		const abortAndRelease = async (): Promise<Error | null> => {
			let restoreError: Error | null = null;
			try {
				restoreOnFailure();
			} catch (error) {
				restoreError =
					error instanceof Error ? error : new Error(String(error));
			}
			await mutationLease.release("abort");
			this.ambiguousUpdates.delete(organizationId);
			return restoreError;
		};
		const failClosed = (reason: string, successor?: VerifiedDaemonOwner) => {
			this.ambiguousUpdates.set(organizationId, {
				lease: mutationLease,
				predecessor: predecessorIdentity,
				...(successor ? { successor: successor.identity } : {}),
				socketPath: instance.socketPath,
			});
			logEvent("pty_daemon_update_ownership_ambiguous", {
				organizationId,
				predecessorPid: instance.pid,
				reason,
			});
			// Deliberately do not restore the old manifest, liveness watcher, or
			// mutation gate. Once prepare-upgrade may have committed, replaying
			// held operations to the predecessor could duplicate them in a
			// successor. A force restart can establish a new known owner.
			return {
				ok: false as const,
				reason: `${reason}; terminal mutations remain paused until daemon ownership is recovered`,
			};
		};

		try {
			if (existingManifest) {
				writePtyDaemonManifest({
					...existingManifest,
					handoffInProgress: true,
				});
			}
		} catch (error) {
			// No prepare request was sent, so predecessor ownership is certain.
			this.stopping.delete(organizationId);
			this.startAdoptedLivenessCheck(organizationId, instance.pid);
			await client.dispose().catch(() => {});
			await mutationLease.release("abort");
			return {
				ok: false,
				reason: `failed to mark daemon handoff manifest: ${(error as Error).message}`,
			};
		}

		let result: UpgradePreparedResult;
		let successorCandidate: ProcessIdentity | undefined;
		let verifiedSuccessorOwner: VerifiedDaemonOwner | undefined;
		let prepareStarted = false;
		try {
			prepareStarted = true;
			result = await client.prepareUpgrade();
			if (result.ok) {
				if (result.successorPid === predecessorIdentity.pid) {
					return failClosed(
						`handoff ack reused predecessor pid ${result.successorPid}`,
					);
				}
				successorCandidate =
					captureProcessIdentity(result.successorPid) ?? undefined;
				if (!successorCandidate) {
					return failClosed(
						`handoff ack named successor ${result.successorPid} without a capturable process identity`,
					);
				}
			}
		} catch (err) {
			if (!prepareStarted) {
				const restoreError = await abortAndRelease();
				return {
					ok: false,
					reason: `prepareUpgrade connect: ${(err as Error).message}${restoreError ? `; manifest restore failed: ${restoreError.message}` : ""}`,
				};
			}

			// A transport failure after the request was sent is an ambiguous
			// commit: the successor may have adopted the fds and the predecessor
			// may have exited before its reply reached us. Only promote to success
			// when process exit + successor hello prove the new owner. Never replay
			// held mutations to an assumed predecessor.
			const predecessorExited = await waitForProcessIdentityExit(
				predecessorIdentity,
				HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS,
			);
			if (!predecessorExited) {
				return failClosed(
					`prepareUpgrade transport failed: ${(err as Error).message}`,
				);
			}
			const successorOwner = await probeVerifiedDaemonOwnerWithRetry(
				instance.socketPath,
				HANDOFF_PROBE_TOTAL_TIMEOUT_MS,
			);
			if (
				!successorOwner ||
				successorOwner.identity.pid === predecessorIdentity.pid
			) {
				return failClosed(
					`prepareUpgrade transport failed and no successor owner could be proven: ${(err as Error).message}`,
				);
			}
			successorCandidate = successorOwner.identity;
			verifiedSuccessorOwner = successorOwner;
			result = { ok: true, successorPid: successorOwner.identity.pid };
		} finally {
			await client.dispose();
		}

		if (!result.ok) {
			if (!upgradeFailureCanResumePredecessor(result)) {
				const compatibilityDetail = result.ownership
					? ""
					: " (legacy daemon did not report ownership)";
				return failClosed(
					`prepareUpgrade could not prove a unique PTY owner${compatibilityDetail}: ${result.reason}`,
				);
			}
			const restoreError = await abortAndRelease();
			return {
				ok: false,
				reason: restoreError
					? `${result.reason}; manifest restore failed: ${restoreError.message}`
					: result.reason,
			};
		}

		// Gate the probe on predecessor exit — see waitForPidExit's docstring
		// for the race it guards against.
		let predecessorExited = await waitForProcessIdentityExit(
			predecessorIdentity,
			HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS,
		);
		if (!predecessorExited) {
			logEvent("pty_daemon_update_predecessor_escalate", {
				organizationId,
				predecessorPid: instance.pid,
				successorPid: result.successorPid,
				timeoutMs: HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS,
			});
			signalProcessTargetsIfStillOwned(
				[processIdentitySignalTarget(predecessorIdentity)],
				"SIGKILL",
			);
			predecessorExited = await waitForProcessIdentityExit(
				predecessorIdentity,
				DAEMON_TERMINATE_TIMEOUT_MS,
			);
			if (!predecessorExited) {
				return failClosed(
					`predecessor pid ${instance.pid} did not exit within ${HANDOFF_PREDECESSOR_EXIT_TIMEOUT_MS + DAEMON_TERMINATE_TIMEOUT_MS}ms after handoff ack`,
					verifiedSuccessorOwner,
				);
			}
		}

		if (!successorCandidate) {
			return failClosed(
				`successor pid ${result.successorPid} has no captured process identity`,
			);
		}
		const successorOwner = await probeVerifiedDaemonOwnerWithRetry(
			instance.socketPath,
			HANDOFF_PROBE_TOTAL_TIMEOUT_MS,
		);
		if (
			!successorOwner ||
			!promoteVerifiedSuccessorIdentity(successorCandidate, successorOwner)
		) {
			return failClosed(
				`successor pid ${result.successorPid} did not answer the ownership probe`,
			);
		}
		verifiedSuccessorOwner = successorOwner;
		const runningVersion = successorOwner.probe.daemonVersion;

		// Single capture so the in-memory instance and the manifest agree.
		const successorStartedAt = Date.now();
		const successorInstance: DaemonInstance = {
			pid: result.successorPid,
			socketPath: instance.socketPath,
			startedAt: successorStartedAt,
			runningVersion,
			expectedVersion: EXPECTED_DAEMON_VERSION,
			updatePending: !semver.satisfies(
				runningVersion,
				`>=${EXPECTED_DAEMON_VERSION}`,
			),
		};
		this.instances.set(organizationId, successorInstance);
		this.stopping.delete(organizationId);
		this.lastUpdatePendingPair.delete(organizationId);

		try {
			writePtyDaemonManifest({
				pid: result.successorPid,
				socketPath: instance.socketPath,
				protocolVersions: existingManifest?.protocolVersions ?? [
					CURRENT_PROTOCOL_VERSION,
				],
				startedAt: successorStartedAt,
				organizationId,
			});
		} catch (error) {
			return failClosed(
				`successor ownership was proven but its manifest could not be persisted: ${(error as Error).message}`,
				verifiedSuccessorOwner,
			);
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

		// The instance and durable manifest now agree on the successor. Rotate
		// the cached mutation transport, then drain held work serially; each
		// queued closure resolves getDaemonClient() only at execution time.
		try {
			await mutationLease.release("success");
		} catch (error) {
			return failClosed(
				`successor ownership was proven but host transport rotation failed: ${(error as Error).message}`,
				verifiedSuccessorOwner,
			);
		}
		this.ambiguousUpdates.delete(organizationId);
		return { ok: true, successorPid: result.successorPid };
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
	restart(organizationId: string): Promise<{ success: true }> {
		const existing = this.restartInFlight.get(organizationId);
		if (existing) return existing;
		const promise = this.runSerializedRestart(organizationId).finally(() => {
			this.restartInFlight.delete(organizationId);
		});
		this.restartInFlight.set(organizationId, promise);
		return promise;
	}

	private async runSerializedRestart(
		organizationId: string,
	): Promise<{ success: true }> {
		// A restart is destructive, but it still must not interleave with a smooth
		// handoff that may later publish a successor and release its writer gate.
		const update = this.updateInFlight.get(organizationId);
		if (update) await update.catch(() => {});
		return this.forceRestart(organizationId, {
			event: "pty_daemon_user_restart",
			props: {},
		});
	}

	private async forceRestart(
		organizationId: string,
		log: { event: string; props: Record<string, unknown> },
	): Promise<{ success: true }> {
		const prev = this.instances.get(organizationId);
		const hadCircuitOpen = this.circuitOpen.has(organizationId);
		const ambiguous = this.ambiguousUpdates.get(organizationId);

		const pending = this.pendingStarts.get(organizationId);
		if (pending) {
			try {
				await pending;
			} catch {
				// Failed in-flight spawn — nothing to stop, ensure() will retry.
			}
		}

		const logRestart = () => {
			logEvent(log.event, {
				organizationId,
				hadCircuitOpen,
				previousRunningVersion: prev?.runningVersion ?? null,
				previousExpectedVersion: prev?.expectedVersion ?? null,
				previousUpdatePending: prev?.updatePending ?? null,
				...log.props,
			});
		};

		if (ambiguous) {
			// `stop()` accepts only the mutable numeric PID stored on the instance.
			// Once handoff ownership is ambiguous, using it could signal a recycled
			// unrelated process. Forget local tracking without signaling, then recover
			// exclusively through the captured identity witnesses below.
			this.instances.delete(organizationId);
			this.stopAdoptedLivenessCheck(organizationId);
			this.stopping.add(organizationId);
			this.spawnOnlyOrganizations.add(organizationId);
			try {
				removePtyDaemonManifest(organizationId);
				await this.eliminateAmbiguousOwners(ambiguous);
				this.clearCrashCircuit(organizationId);
				logRestart();

				// `ensure()` remains the single-flight start gate, but the spawn-only
				// marker makes start() skip every manifest/socket adoption path. A
				// successor that binds after the elimination scan can therefore never be
				// mistaken for the deliberately spawned replacement.
				const fresh = await this.ensure(organizationId);
				await this.proveFreshOwner(fresh);
				await ambiguous.lease.resetAfterForceRestart(
					new Error(
						"Terminal mutation was cancelled because force restart replaced the pty-daemon and its sessions",
					),
				);
				this.ambiguousUpdates.delete(organizationId);
				return { success: true };
			} finally {
				// The old instance was deliberately removed before signaling, so its
				// child exit callback cannot consume this marker. Clear both guards even
				// when elimination/proof fails closed; otherwise a later retry or crash
				// would be masked. Throws still prevent the mutation lease from reopening.
				this.stopping.delete(organizationId);
				this.spawnOnlyOrganizations.delete(organizationId);
			}
		}

		await this.stop(organizationId);
		this.clearCrashCircuit(organizationId);
		logRestart();
		await this.ensure(organizationId);
		return { success: true };
	}

	private async proveFreshOwner(
		instance: DaemonInstance,
		probeOwner: (
			socketPath: string,
			totalTimeoutMs: number,
		) => Promise<VerifiedDaemonOwner | null> = probeVerifiedDaemonOwnerWithRetry,
	): Promise<void> {
		if (!instance.spawnIdentity) {
			throw new Error(
				`force restart did not capture spawned daemon identity ${instance.pid}`,
			);
		}
		const owner = await probeOwner(
			instance.socketPath,
			HANDOFF_PROBE_TOTAL_TIMEOUT_MS,
		);
		if (
			!owner ||
			!sameProcessIdentity(owner.identity, instance.spawnIdentity)
		) {
			throw new Error(
				`force restart could not prove exact fresh daemon owner ${instance.pid}`,
			);
		}
	}

	private async eliminateAmbiguousOwners(
		recovery: AmbiguousUpdateRecovery,
		options: AmbiguousOwnerEliminationOptions = {},
	): Promise<ProcessSignalTarget[]> {
		const readCurrentProcessTable =
			options.readCurrentProcessTable ?? readProcessTable;
		const isPidAlive = options.isPidAlive ?? isProcessAlive;
		const identityExitTimeoutMs =
			options.identityExitTimeoutMs ?? DAEMON_TERMINATE_TIMEOUT_MS;
		const probeOwner = options.probeOwner ?? probeVerifiedDaemonOwner;
		const now = options.now ?? Date.now;
		const sleep =
			options.sleep ??
			((timeoutMs: number) =>
				new Promise((resolve) => setTimeout(resolve, timeoutMs)));
		const signaled: ProcessSignalTarget[] = [];
		const candidates = new Map<string, ProcessIdentity>();
		const remember = (identity: ProcessIdentity) => {
			candidates.set(processIdentityKey(identity), identity);
		};
		remember(recovery.predecessor);
		if (recovery.successor) remember(recovery.successor);
		for (const identity of candidates.values()) {
			signaled.push(
				...(await terminateProcessIdentityTreeAndGroups(
					identity,
					"SIGKILL",
					readCurrentProcessTable,
					isPidAlive,
					identityExitTimeoutMs,
				)),
			);
		}

		// A successor whose ACK/reply was lost may bind only after the predecessor
		// IPC channel closes. Scan the complete post-handoff bind window and kill
		// every responder before starting a fresh daemon; returning on the first
		// quiet probe would reopen a race with a late binder.
		const deadline =
			now() + (options.probeWindowMs ?? HANDOFF_PROBE_TOTAL_TIMEOUT_MS);
		while (now() < deadline) {
			const remaining = deadline - now();
			const owner = await probeOwner(
				recovery.socketPath,
				Math.min(remaining, 250),
			);
			if (owner) {
				remember(owner.identity);
				signaled.push(
					...(await terminateProcessIdentityTreeAndGroups(
						owner.identity,
						"SIGKILL",
						readCurrentProcessTable,
						isPidAlive,
						identityExitTimeoutMs,
					)),
				);
			}
			await sleep(50);
		}

		for (const identity of candidates.values()) {
			if (
				!processIdentityHasExited(identity, readCurrentProcessTable, isPidAlive)
			) {
				throw new Error(
					`ambiguous pty-daemon owner ${identity.pid} survived force restart`,
				);
			}
		}
		return signaled;
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
	 * boot, fire-and-track, doesn't block anything. A daemon advertising the
	 * lossless-live-handoff capability may rotate with live sessions; legacy or
	 * unverified daemons defer until idle. This path never force-restarts.
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
		void this.runAutoUpdate(organizationId, instance).catch((err) => {
			logEvent("pty_daemon_auto_update_failed", {
				organizationId,
				pid: instance.pid,
				runningVersion: instance.runningVersion,
				expectedVersion: instance.expectedVersion,
				reason: `threw: ${(err as Error).message}`,
				leftPending: true,
			});
			this.recordAutoUpdateFailure(
				organizationId,
				instance,
				`threw: ${(err as Error).message}`,
			);
		});
	}

	private async runAutoUpdate(
		organizationId: string,
		instance: DaemonInstance,
	): Promise<void> {
		const sessions = await this.listSessions(
			organizationId,
			AUTO_UPDATE_SESSION_LIST_TIMEOUT_MS,
		);
		if (sessions === null) {
			this.deferAutoUpdate(
				organizationId,
				instance,
				"session_list_unavailable",
			);
			return;
		}
		const aliveSessionCount = countAliveSessions(sessions);
		if (aliveSessionCount > 0) {
			const probe = await probeDaemonHello(
				instance.socketPath,
				AUTO_UPDATE_SESSION_LIST_TIMEOUT_MS,
			);
			if (!probe) {
				this.deferAutoUpdate(
					organizationId,
					instance,
					"live_handoff_capability_unknown",
					{ aliveSessionCount },
				);
				return;
			}
			const capabilityFailure = liveHandoffCapabilityFailure(
				sessions,
				probe.capabilities.includes(LOSSLESS_LIVE_HANDOFF_CAPABILITY),
			);
			if (capabilityFailure) {
				this.deferAutoUpdate(
					organizationId,
					instance,
					"live_handoff_capability_missing",
					{ aliveSessionCount },
				);
				return;
			}
		}

		const update = this.startUpdate(organizationId);
		try {
			const result = await update.promise;
			if (result.ok) {
				logEvent("pty_daemon_auto_update_ok", {
					organizationId,
					previousPid: instance.pid,
					successorPid: result.successorPid,
					previousVersion: instance.runningVersion,
				});
				return;
			}

			const leftPending = this.isAutoUpdateFailureStillPending(
				organizationId,
				instance,
				update.started,
			);
			logEvent("pty_daemon_auto_update_failed", {
				organizationId,
				pid: instance.pid,
				runningVersion: instance.runningVersion,
				expectedVersion: instance.expectedVersion,
				reason: result.reason,
				leftPending,
			});
			if (leftPending) {
				this.recordAutoUpdateFailure(organizationId, instance, result.reason);
			}
		} catch (err) {
			const reason = `threw: ${(err as Error).message}`;
			const leftPending = this.isAutoUpdateFailureStillPending(
				organizationId,
				instance,
				update.started,
			);
			logEvent("pty_daemon_auto_update_failed", {
				organizationId,
				pid: instance.pid,
				runningVersion: instance.runningVersion,
				expectedVersion: instance.expectedVersion,
				reason,
				leftPending,
			});
			if (leftPending) {
				this.recordAutoUpdateFailure(organizationId, instance, reason);
			}
		}
	}

	private isAutoUpdateFailureStillPending(
		organizationId: string,
		instance: DaemonInstance,
		updateStartedHere: boolean,
	): boolean {
		return (
			updateStartedHere &&
			this.instances.get(organizationId) === instance &&
			instance.updatePending
		);
	}

	private recordAutoUpdateFailure(
		organizationId: string,
		instance: DaemonInstance,
		reason: string,
	): void {
		const current = this.instances.get(organizationId);
		if (!current || current.pid !== instance.pid || !current.updatePending) {
			return;
		}
		const failedAt = Date.now();
		current.autoUpdateFailure = {
			id: `${current.pid}:${current.runningVersion}:${current.expectedVersion}:${failedAt}`,
			reason,
			failedAt,
		};
	}

	private deferAutoUpdate(
		organizationId: string,
		instance: DaemonInstance,
		reason: string,
		extra: Record<string, unknown> = {},
	): void {
		logEvent("pty_daemon_auto_update_deferred", {
			organizationId,
			pid: instance.pid,
			runningVersion: instance.runningVersion,
			expectedVersion: instance.expectedVersion,
			reason,
			...extra,
		});
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
		const spawnOnly = this.spawnOnlyOrganizations.has(organizationId);
		// Dev mode: never adopt. A leftover detached daemon from a previous
		// `bun dev` session would mask code changes — devs hit Update or
		// open a session and see stale-bundle behavior with no obvious
		// reason. Kill any running daemon for the org and spawn fresh.
		// Production keeps the adopt path so PTY sessions survive
		// host-service restarts (the original Phase 1 promise).
		if (!spawnOnly && shouldKillStaleDaemonForDev()) {
			await this.killStaleDaemonForDev(organizationId);
		}

		const adopted = spawnOnly ? null : await this.tryAdopt(organizationId);
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
			// than the bundled binary, try a smooth handoff in the background.
			// This path never force-restarts; if handoff fails, the desktop UI
			// exposes the explicit destructive fallback.
			if (adopted.updatePending && this.opts.autoUpdate !== false) {
				this.kickoffAutoUpdate(organizationId, adopted);
			}
			return adopted;
		}

		const instance = await this.spawn(organizationId, {
			requireProcessIdentity: spawnOnly,
		});
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
		const expectedSocketPath = ptyDaemonSocketPath(organizationId);
		if (!manifest) {
			return this.tryAdoptFromSocket(organizationId, expectedSocketPath, {
				reason: "manifest_missing",
			});
		}
		if (!isProcessAlive(manifest.pid)) {
			removePtyDaemonManifest(organizationId);
			return this.tryAdoptFromSocket(organizationId, expectedSocketPath, {
				reason: "manifest_pid_dead",
			});
		}
		const reachable = await isSocketConnectable(manifest.socketPath, 1000);
		if (!reachable) {
			// PID alive but socket gone — daemon is wedged. Kill and respawn.
			await terminateProcessTreeAndGroups(manifest.pid, "SIGTERM");
			removePtyDaemonManifest(organizationId);
			if (manifest.socketPath !== expectedSocketPath) {
				return this.tryAdoptFromSocket(organizationId, expectedSocketPath, {
					reason: "manifest_socket_unreachable",
					previousManifest: manifest,
				});
			}
			return null;
		}

		const probe = await probeDaemonHelloWithRetry(
			manifest.socketPath,
			ADOPTION_PROBE_TOTAL_TIMEOUT_MS,
		);
		if (!probe) {
			logEvent("pty_daemon_adopt_rejected", {
				organizationId,
				pid: manifest.pid,
				socketPath: manifest.socketPath,
				reason: "version_probe_failed",
			});
			await terminateProcessTreeAndGroups(manifest.pid, "SIGTERM");
			removePtyDaemonManifest(organizationId);
			if (manifest.socketPath !== expectedSocketPath) {
				return this.tryAdoptFromSocket(organizationId, expectedSocketPath, {
					reason: "manifest_version_probe_failed",
					previousManifest: manifest,
				});
			}
			return null;
		}
		const runningVersion = probe.daemonVersion;
		const updatePending = !semver.satisfies(
			runningVersion,
			`>=${EXPECTED_DAEMON_VERSION}`,
		);

		return {
			pid: manifest.pid,
			socketPath: manifest.socketPath,
			startedAt: manifest.startedAt,
			runningVersion,
			expectedVersion: EXPECTED_DAEMON_VERSION,
			updatePending,
		};
	}

	private async tryAdoptFromSocket(
		organizationId: string,
		socketPath: string,
		context: {
			reason: string;
			previousManifest?: PtyDaemonManifest;
		},
	): Promise<DaemonInstance | null> {
		const reachable = await isSocketConnectable(socketPath, 1000);
		if (!reachable) return null;

		const probe = await probeDaemonHelloWithRetry(
			socketPath,
			ADOPTION_PROBE_TOTAL_TIMEOUT_MS,
		);
		if (!probe) {
			logEvent("pty_daemon_socket_adopt_rejected", {
				organizationId,
				socketPath,
				reason: "version_probe_failed",
				sourceReason: context.reason,
			});
			return null;
		}

		const resolvedPid = probe.daemonPid;
		if (!isPositiveInteger(resolvedPid) || !isProcessAlive(resolvedPid)) {
			logEvent("pty_daemon_socket_adopt_rejected", {
				organizationId,
				socketPath,
				reason: "pid_unavailable",
				sourceReason: context.reason,
				probedPid: resolvedPid,
			});
			return null;
		}

		const startedAt = context.previousManifest?.startedAt ?? Date.now();
		writePtyDaemonManifest({
			pid: resolvedPid,
			socketPath,
			protocolVersions: [CURRENT_PROTOCOL_VERSION],
			startedAt,
			organizationId,
		});

		logEvent("pty_daemon_socket_adopt_manifest_recovered", {
			organizationId,
			pid: resolvedPid,
			socketPath,
			sourceReason: context.reason,
			runningVersion: probe.daemonVersion,
		});

		return {
			pid: resolvedPid,
			socketPath,
			startedAt,
			runningVersion: probe.daemonVersion,
			expectedVersion: EXPECTED_DAEMON_VERSION,
			updatePending: !semver.satisfies(
				probe.daemonVersion,
				`>=${EXPECTED_DAEMON_VERSION}`,
			),
		};
	}

	private async spawn(
		organizationId: string,
		options: { requireProcessIdentity?: boolean } = {},
	): Promise<DaemonInstance> {
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
		const isDev = process.env.NODE_ENV === "development";
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
			// Raise RLIMIT_NOFILE before exec: macOS's 256 soft default starves a
			// daemon hosting many worktrees' PTYs and surfaces as node-pty
			// "posix_spawnp failed" (EMFILE). The raised limit is inherited by
			// handoff successors the daemon spawns from itself.
			const isWindows = process.platform === "win32";
			const command = isWindows ? process.execPath : "/bin/sh";
			const commandArgs = isWindows
				? [this.opts.scriptPath, `--socket=${socketPath}`]
				: [
						"-c",
						'ulimit -n 1048576 2>/dev/null || ulimit -n "$(ulimit -Hn)" 2>/dev/null || true; exec "$@"',
						"sh",
						process.execPath,
						this.opts.scriptPath,
						`--socket=${socketPath}`,
					];
			child = childProcess.spawn(command, commandArgs, {
				detached: !isDev,
				stdio,
				env: childEnv,
				windowsHide: true,
			});
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
		const spawnIdentity = options.requireProcessIdentity
			? ((await captureProcessIdentityWithRetry(childPid)) ?? undefined)
			: undefined;
		if (options.requireProcessIdentity && !spawnIdentity) {
			try {
				child.kill("SIGKILL");
			} catch {
				// best-effort; recovery remains fail-closed
			}
			throw new Error(
				`[pty-daemon:${organizationId}] could not capture spawned process identity ${childPid}`,
			);
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
			protocolVersions: [CURRENT_PROTOCOL_VERSION],
			startedAt,
			organizationId,
		};
		writePtyDaemonManifest(manifest);

		const instance: DaemonInstance = {
			pid: childPid,
			socketPath,
			startedAt,
			spawnIdentity,
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

function countAliveSessions(sessions: SessionInfo[]): number {
	return sessions.filter((session) => session.alive).length;
}

function isValidSessionList(value: unknown): value is SessionInfo[] {
	return (
		Array.isArray(value) &&
		value.every(
			(session) =>
				typeof session === "object" &&
				session !== null &&
				typeof (session as Partial<SessionInfo>).id === "string" &&
				Number.isInteger((session as Partial<SessionInfo>).pid) &&
				Number.isInteger((session as Partial<SessionInfo>).cols) &&
				Number.isInteger((session as Partial<SessionInfo>).rows) &&
				typeof (session as Partial<SessionInfo>).alive === "boolean",
		)
	);
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
						cleanup(isValidSessionList(msg.sessions) ? msg.sessions : null);
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
async function probeDaemonHelloWithRetry(
	socketPath: string,
	totalTimeoutMs: number,
): Promise<DaemonProbeResult | null> {
	const deadline = Date.now() + totalTimeoutMs;
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		const perAttempt = Math.min(remaining, VERSION_PROBE_TIMEOUT_MS);
		const probe = await probeDaemonHello(socketPath, perAttempt);
		if (probe !== null) return probe;
		await new Promise((r) => setTimeout(r, 50));
	}
	return null;
}

/** @internal Exported for deterministic socket identity-recheck tests. */
export interface VerifiedDaemonOwner {
	probe: DaemonProbeResult;
	identity: ProcessIdentity;
}

/**
 * An ACK PID is only a candidate. It becomes safe for later recovery signals
 * after the socket responder independently proves the exact same lifetime.
 */
export function promoteVerifiedSuccessorIdentity(
	candidate: ProcessIdentity,
	owner: VerifiedDaemonOwner | null,
): ProcessIdentity | null {
	return owner && sameProcessIdentity(candidate, owner.identity)
		? owner.identity
		: null;
}

async function probeVerifiedDaemonOwnerWithRetry(
	socketPath: string,
	totalTimeoutMs: number,
): Promise<VerifiedDaemonOwner | null> {
	const deadline = Date.now() + totalTimeoutMs;
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		try {
			const owner = await probeVerifiedDaemonOwner(
				socketPath,
				Math.min(remaining, VERSION_PROBE_TIMEOUT_MS * 2),
			);
			if (owner) return owner;
		} catch {
			// Invalid identity claims are not ownership proofs. The caller will
			// remain fail-closed if no later responder can be verified.
			return null;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return null;
}

/**
 * A hello PID becomes an ownership witness only after a second hello reports
 * the same PID and the exact process identity still matches after that reply.
 */
/** @internal Exported for deterministic socket identity-recheck tests. */
export async function probeVerifiedDaemonOwner(
	socketPath: string,
	timeoutMs: number,
	readCurrentProcessTable: () => ProcessInfo[] = readProcessTable,
): Promise<VerifiedDaemonOwner | null> {
	const deadline = Date.now() + timeoutMs;
	const first = await probeDaemonHello(
		socketPath,
		Math.max(1, Math.floor(timeoutMs / 2)),
	);
	if (!first) return null;
	if (!isPositiveInteger(first.daemonPid)) {
		throw new Error(
			"pty-daemon answered without a verifiable process identity",
		);
	}
	const identity = captureProcessIdentity(
		first.daemonPid,
		readCurrentProcessTable(),
	);
	if (!identity) {
		throw new Error(
			`pty-daemon ${first.daemonPid} answered but its process identity could not be verified`,
		);
	}

	const remaining = deadline - Date.now();
	if (remaining <= 0) {
		throw new Error("pty-daemon identity recheck timed out");
	}
	const second = await probeDaemonHello(socketPath, remaining);
	if (!second) {
		throw new Error("pty-daemon identity recheck did not answer");
	}
	if (!isPositiveInteger(second.daemonPid)) {
		throw new Error("pty-daemon identity recheck omitted its process id");
	}
	if (second.daemonPid !== identity.pid) {
		throw new Error("pty-daemon identity changed between rechecks");
	}
	if (!processIdentityMatches(identity, readCurrentProcessTable())) {
		throw new Error("pty-daemon process identity changed after recheck");
	}
	return { probe: second, identity };
}

async function captureProcessIdentityWithRetry(
	pid: number,
	timeoutMs = DAEMON_TERMINATE_TIMEOUT_MS,
): Promise<ProcessIdentity | null> {
	const deadline = Date.now() + timeoutMs;
	do {
		const identity = captureProcessIdentity(pid);
		if (identity) return identity;
		if (!isProcessAlive(pid)) return null;
		await new Promise((resolve) => setTimeout(resolve, 25));
	} while (Date.now() < deadline);
	return captureProcessIdentity(pid);
}

function processIdentityKey(identity: ProcessIdentity): string {
	return `${identity.pid}:${identity.pgid}:${identity.startTime}`;
}

async function terminateProcessIdentityTreeAndGroups(
	identity: ProcessIdentity,
	signal: NodeJS.Signals,
	readCurrentProcessTable: () => ProcessInfo[] = readProcessTable,
	isPidAlive: (pid: number) => boolean = isProcessAlive,
	timeoutMs = DAEMON_TERMINATE_TIMEOUT_MS,
): Promise<ProcessSignalTarget[]> {
	const signaled = signalProcessTreeAndGroupsIfStillOwned(
		identity,
		signal,
		{},
		readCurrentProcessTable,
	);
	if (
		await waitForProcessIdentityExit(
			identity,
			timeoutMs,
			readCurrentProcessTable,
			isPidAlive,
		)
	) {
		return signaled;
	}
	signaled.push(
		...signalProcessTreeAndGroupsIfStillOwned(
			identity,
			"SIGKILL",
			{},
			readCurrentProcessTable,
		),
	);
	await waitForProcessIdentityExit(
		identity,
		timeoutMs,
		readCurrentProcessTable,
		isPidAlive,
	);
	return signaled;
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
 * PID reuse counts as exit of the captured process lifetime. An absent row is
 * only conclusive when the kernel also reports the PID gone: `ps` can fail or
 * yield an incomplete table, which must not turn recovery into fail-open.
 */
function processIdentityHasExited(
	identity: ProcessIdentity,
	readCurrentProcessTable: () => ProcessInfo[] = readProcessTable,
	isPidAlive: (pid: number) => boolean = isProcessAlive,
): boolean {
	const currentTable = readCurrentProcessTable();
	const currentPid = currentTable.find((row) => row.pid === identity.pid);
	if (currentPid?.startTime) {
		return !processIdentityMatches(identity, currentTable);
	}
	return !isPidAlive(identity.pid);
}

async function waitForProcessIdentityExit(
	identity: ProcessIdentity,
	timeoutMs: number,
	readCurrentProcessTable: () => ProcessInfo[] = readProcessTable,
	isPidAlive: (pid: number) => boolean = isProcessAlive,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (processIdentityHasExited(identity, readCurrentProcessTable, isPidAlive))
			return true;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return processIdentityHasExited(
		identity,
		readCurrentProcessTable,
		isPidAlive,
	);
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
	return (await probeDaemonHello(socketPath, timeoutMs))?.daemonVersion ?? null;
}

function probeDaemonHello(
	socketPath: string,
	timeoutMs: number,
): Promise<DaemonProbeResult | null> {
	return new Promise<DaemonProbeResult | null>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const decoder = new FrameDecoder();
		let settled = false;

		const cleanup = (value: DaemonProbeResult | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			sock.removeAllListeners();
			// Destroying a still-connecting pipe may emit another error after the
			// first one settled the probe. Keep a sink installed through teardown.
			sock.on("error", () => {});
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
						const daemonVersion = msg.daemonVersion;
						if (!daemonVersion) {
							cleanup(null);
							return;
						}
						cleanup({
							daemonVersion,
							daemonPid: msg.daemonPid,
							capabilities: Array.isArray(msg.capabilities)
								? msg.capabilities.filter(
										(capability): capability is string =>
											typeof capability === "string",
									)
								: [],
						});
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
