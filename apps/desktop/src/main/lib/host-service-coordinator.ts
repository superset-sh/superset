import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { organizations, settings } from "@superset/local-db";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { eq } from "drizzle-orm";
import { app, dialog } from "electron";
import log from "electron-log/main";
import { env as sharedEnv } from "shared/env.shared";
import { getProcessEnvWithShellPath } from "../../lib/trpc/routers/workspaces/utils/shell-env";
import { env as mainEnv } from "../env.main";
import { SUPERSET_HOME_DIR } from "./app-environment";
import { getBrowserBridgeInfo } from "./browser/browser-bridge-info";
import { acquireSpawnLock } from "./host-service-lock";
import {
	isProcessAlive,
	killProcess,
	manifestDir,
	readManifest,
	removeManifest,
} from "./host-service-manifest";
import {
	HOST_SERVICE_RESPAWN_STABLE_MS,
	nextRespawnDelayMs,
} from "./host-service-respawn";
import {
	findFreePort,
	HEALTH_POLL_TIMEOUT_MS,
	MAX_HOST_LOG_BYTES,
	openRotatingLogFd,
	pollHealthCheck,
} from "./host-service-utils";
import { localDb } from "./local-db";
import { getRelayUrl } from "./relay-url";
import { HOOK_PROTOCOL_VERSION } from "./terminal/env";

export type HostServiceStatus = "starting" | "running" | "stopped";

export interface Connection {
	port: number;
	secret: string;
	machineId: string;
}

export interface HostServiceStatusEvent {
	organizationId: string;
	status: HostServiceStatus;
	previousStatus: HostServiceStatus | null;
}

export interface SpawnConfig {
	authToken: string;
	cloudApiUrl: string;
}

/**
 * Automatic-respawn bookkeeping for one organization. `attempts` is the budget
 * spent so far (see `nextRespawnDelayMs`); `timer` is a scheduled respawn that
 * `stop()` must cancel so quitting cannot resurrect a child mid-shutdown.
 */
interface RespawnState {
	attempts: number;
	timer: ReturnType<typeof setTimeout> | null;
	stableTimer: ReturnType<typeof setTimeout> | null;
}

interface HostServiceProcess {
	pid: number;
	port: number;
	secret: string;
	status: HostServiceStatus;
	spawnedAt: number;
	/** Rolling tail of the child's stdout/stderr, attached to crash reports. */
	outputTail: string;
	/**
	 * Every secret handed to this child. `outputTail` is raw child output, so
	 * anything the child logs (a request header, an env dump in a stack trace)
	 * can land in a crash report — strip these before it reaches telemetry.
	 */
	redactions: string[];
	/**
	 * True when this instance spawned the child and owns its lifecycle (may
	 * SIGTERM it and remove its manifest). False when the entry was *adopted*
	 * from another live app instance's host-service — we connect to it but must
	 * never kill it or delete its manifest.
	 */
	owned: boolean;
}

interface PendingStart {
	generation: number;
	promise: Promise<Connection>;
}

/**
 * Short health check used when deciding whether to adopt a foreign
 * host-service — the endpoint either answers within a couple of attempts or it
 * doesn't. Distinct from the long spawn readiness gate (HEALTH_POLL_TIMEOUT_MS).
 */
const ADOPT_HEALTH_TIMEOUT_MS = 2_500;

/**
 * How long a spawn lock may be held before another instance treats it as
 * wedged and steals it. A legitimate spawn holds the lock for the full health
 * poll window, so allow that plus margin.
 */
const SPAWN_LOCK_STALE_MS = HEALTH_POLL_TIMEOUT_MS + 5_000;

/** Overall budget for startOrAdopt to wait out a peer's in-flight spawn. */
const START_OR_ADOPT_DEADLINE_MS = SPAWN_LOCK_STALE_MS + HEALTH_POLL_TIMEOUT_MS;

/** Poll interval while waiting for a peer instance's spawn to go healthy. */
const ADOPT_WAIT_INTERVAL_MS = 250;

/**
 * How long a SIGTERMed child gets to exit on its own before SIGKILL. The
 * child's own shutdown budget (grace + dispose deadline in
 * `host-service/shutdown.ts`) is ~5s, so this only fires for a child whose
 * signal handler never ran at all.
 */
const STOP_KILL_ESCALATION_MS = 5_000;

/**
 * Startup reap identity window. `ps` reports process age at 1 s granularity
 * and the manifest's `startedAt` is written after createApp() (migrations
 * included), so the process is somewhat older than the manifest, never
 * younger. A process that started after the manifest cannot have written it.
 */
const REAP_IDENTITY_MAX_OLDER_MS = 10 * 60_000;
const REAP_IDENTITY_MAX_YOUNGER_MS = 60_000;

/** After SIGKILLing a wedged holder, wait this long for its port to free. */
const REAP_EXIT_WAIT_MS = 1_000;
const REAP_EXIT_POLL_MS = 25;

/** What `ps` reports for a live pid; null when the pid cannot be inspected. */
interface ProcessIdentity {
	elapsedMs: number;
	command: string;
}

/**
 * A Node abort dumps ~5KB of native + JS backtrace on the way down, so a
 * smaller window would evict the assertion line and every app log before it.
 */
const MAX_OUTPUT_TAIL_BYTES = 16_384;

/**
 * `exit` fires before the child's piped stdio has drained, so the crash report
 * waits this long for the last output — a native abort message is written on
 * the way down and would otherwise be missed.
 */
const CRASH_REPORT_FLUSH_MS = 500;

// High, uncommon user-space range: above usual web/dev server ports and below
// macOS's default ephemeral range, while still falling back if occupied.
const STABLE_PORT_BASE = 48_000;
const STABLE_PORT_COUNT = 1_000;
const SAFE_ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isSafeOrganizationId(organizationId: string): boolean {
	return SAFE_ORGANIZATION_ID_PATTERN.test(organizationId);
}

function assertSafeOrganizationId(organizationId: string): void {
	if (!isSafeOrganizationId(organizationId)) {
		throw new Error("Invalid organization ID");
	}
}

function getStablePortForOrganization(organizationId: string): number {
	let hash = 2_166_136_261;
	for (let index = 0; index < organizationId.length; index++) {
		hash ^= organizationId.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return STABLE_PORT_BASE + ((hash >>> 0) % STABLE_PORT_COUNT);
}

/**
 * `ps -o etime=,command=` for one pid. Returns null on Windows (no `ps`),
 * for a pid that is gone, or for output we cannot parse; callers treat null
 * as "unknown", never as "safe to kill".
 */
async function inspectProcessWithPs(
	pid: number,
): Promise<ProcessIdentity | null> {
	if (process.platform === "win32") return null;
	// Async on purpose: a synchronous subprocess here would stall the whole
	// main process (every IPC reply queues behind it) for as long as `ps` takes.
	const stdout = await new Promise<string | null>((resolve) => {
		childProcess.execFile(
			"ps",
			["-o", "etime=,command=", "-p", String(pid)],
			{ encoding: "utf8", timeout: 2_000 },
			(error, out) => resolve(error ? null : out),
		);
	});
	if (stdout == null) return null;
	const line = stdout.trim().split("\n")[0]?.trim();
	const match = line ? /^(\S+)\s+(.*)$/.exec(line) : null;
	if (!match) return null;
	const elapsedMs = parseEtime(match[1] ?? "");
	if (elapsedMs == null) return null;
	return { elapsedMs, command: match[2] ?? "" };
}

/** Parse ps's `[[dd-]hh:]mm:ss` elapsed-time column into milliseconds. */
export function parseEtime(etime: string): number | null {
	const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
	if (!match) return null;
	const [, days = "0", hours = "0", minutes, seconds] = match;
	return (
		(((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 +
			Number(seconds)) *
		1000
	);
}

function isValidPort(port: number | null | undefined): port is number {
	return (
		typeof port === "number" &&
		Number.isInteger(port) &&
		port > 0 &&
		port <= 65_535
	);
}

/**
 * Coupled to Electron: each child is spawned attached and SIGTERMed on
 * before-quit. PTYs survive across Electron restarts via the pty-daemon
 * layer host-service supervises, not via host-service itself. Manifests
 * are still written by the child for the CLI's benefit.
 */
export class HostServiceCoordinator extends EventEmitter {
	private instances = new Map<string, HostServiceProcess>();
	private pendingStarts = new Map<string, PendingStart>();
	private lastKnownPorts = new Map<string, number>();
	private stableSecrets = new Map<string, string>();
	private scriptPath = path.join(__dirname, "host-service.js");
	private machineId = getHostId();
	private devReloadWatcher: fs.FSWatcher | null = null;
	private respawns = new Map<string, RespawnState>();
	private desiredOrganizationIds = new Set<string>();
	/**
	 * SIGKILL escalations pending for SIGTERMed children, by pid. Cancelled by
	 * `handleChildExit` so a pid the kernel has since recycled is never
	 * signalled.
	 */
	private killEscalations = new Map<number, ReturnType<typeof setTimeout>>();
	private startGeneration = 0;
	private configProvider: (() => Promise<SpawnConfig | null>) | null = null;
	/**
	 * Seam for the respawn delay. Production uses `setTimeout`; tests replace it so
	 * they assert the scheduling decision instead of sleeping through a jittered
	 * production delay.
	 */
	private scheduleRespawnTimer: (
		run: () => void,
		delayMs: number,
	) => ReturnType<typeof setTimeout> = (run, delayMs) =>
		setTimeout(run, delayMs);
	/**
	 * Seam for the startup reap's identity check. Production shells out to
	 * `ps`; tests hand back a canned identity for their fake pids.
	 */
	private inspectProcess: (pid: number) => Promise<ProcessIdentity | null> =
		inspectProcessWithPs;

	/**
	 * Supplies fresh spawn config for automatic respawns. A respawn must not
	 * reuse the config captured when the child was first spawned: `authToken` can
	 * rotate across a long uptime, and reusing a stale one turns a recoverable
	 * crash into a failed restart.
	 */
	setConfigProvider(provider: () => Promise<SpawnConfig | null>): void {
		this.configProvider = provider;
	}

	async start(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
		assertSafeOrganizationId(organizationId);
		return this.startWithPreferredPorts(organizationId, config);
	}

	private async startWithPreferredPorts(
		organizationId: string,
		config: SpawnConfig,
		preferredPorts?: Iterable<number>,
	): Promise<Connection> {
		const generation = this.startGeneration;
		const existing = this.instances.get(organizationId);
		if (existing?.status === "running") {
			// An adopted entry points at a foreign instance's child we don't
			// supervise (no exit handler). Re-validate it's still alive before
			// handing it back; if the owner died, drop it and start fresh.
			if (existing.owned || isProcessAlive(existing.pid)) {
				return {
					port: existing.port,
					secret: existing.secret,
					machineId: this.machineId,
				};
			}
			this.instances.delete(organizationId);
			this.emitStatus(organizationId, "stopped", "running");
		}

		const pending = this.pendingStarts.get(organizationId);
		if (pending) {
			if (pending.generation === generation) return pending.promise;
			try {
				await pending.promise;
			} catch {
				// A superseded start is expected to reject after teardown.
			}
			return this.startWithPreferredPorts(
				organizationId,
				config,
				preferredPorts,
			);
		}

		const isStartAllowed = () => this.startGeneration === generation;

		const startPromise = this.startOrAdopt(
			organizationId,
			config,
			preferredPorts ?? this.getPreferredPorts(organizationId),
			isStartAllowed,
		).then((connection) => {
			if (!isStartAllowed()) {
				this.stop(organizationId);
				throw new Error("Host service start cancelled");
			}
			return connection;
		});
		const pendingStart = { generation, promise: startPromise };
		this.pendingStarts.set(organizationId, pendingStart);

		try {
			return await startPromise;
		} finally {
			if (this.pendingStarts.get(organizationId) === pendingStart) {
				this.pendingStarts.delete(organizationId);
			}
		}
	}

	private getPreferredPorts(organizationId: string): number[] {
		const ports = [
			this.instances.get(organizationId)?.port,
			this.lastKnownPorts.get(organizationId),
			getStablePortForOrganization(organizationId),
		];
		const uniquePorts: number[] = [];
		const seen = new Set<number>();

		for (const port of ports) {
			if (!isValidPort(port) || seen.has(port)) continue;
			seen.add(port);
			uniquePorts.push(port);
		}

		return uniquePorts;
	}

	private rememberPort(organizationId: string, port: number): void {
		if (!isValidPort(port)) return;
		this.lastKnownPorts.set(organizationId, port);
	}

	/**
	 * One PSK per org for the coordinator's lifetime, seeded from a surviving
	 * manifest when there is one. Respawns and restarts must reuse it: every
	 * live client (renderer windows, the CLI, peer app instances) caches this
	 * secret against the host URL, and rotating it per spawn strands them all
	 * on auth-rejected redials until their next connection poll — which showed
	 * up as multi-second "Host unreachable" screens after a restarted service
	 * was already serving. Stability gives up nothing: the current secret
	 * already sits on disk in the manifest for adoption, so per-spawn rotation
	 * never narrowed its exposure.
	 */
	private getOrCreateSecret(organizationId: string): string {
		const existing =
			this.stableSecrets.get(organizationId) ??
			readManifest(organizationId)?.authToken;
		const secret = existing ?? randomBytes(32).toString("hex");
		this.stableSecrets.set(organizationId, secret);
		return secret;
	}

	stop(organizationId: string): void {
		// Cancel first, and unconditionally: a respawn may be pending with no
		// instance tracked (the crashed one was already deleted), and quitting or
		// restarting must not let that timer resurrect a child.
		this.clearRespawnState(organizationId);

		const instance = this.instances.get(organizationId);
		if (!instance) return;

		const previousStatus = instance.status;
		instance.status = "stopped";
		this.rememberPort(organizationId, instance.port);

		// Only owned children are ours to kill + de-manifest. Adopted entries
		// (owned=false) belong to another live instance — fall through and just
		// drop our local reference below; never SIGTERM it or remove its manifest.
		if (instance.owned) {
			try {
				if (instance.pid > 0) {
					killProcess(instance.pid, "SIGTERM");
					this.scheduleKillEscalation(organizationId, instance.pid);
				}
			} catch {}
			this.removeManifestIfHeldBy(organizationId, instance.pid);
		}

		this.instances.delete(organizationId);
		this.emitStatus(organizationId, "stopped", previousStatus);
	}

	/**
	 * Remove the manifest only when `pid` holds it. Another live instance may
	 * have claimed it since we spawned; deleting that claim would strand the
	 * CLI ("host service isn't running") while the claimant still serves. An
	 * unreadable manifest is left alone too — a torn read of a concurrent
	 * writer's claim must not read as license to delete.
	 */
	private removeManifestIfHeldBy(organizationId: string, pid: number): void {
		if (readManifest(organizationId)?.pid !== pid) return;
		removeManifest(organizationId);
	}

	stopAll(): void {
		this.startGeneration++;
		this.desiredOrganizationIds.clear();
		for (const [id] of this.instances) {
			this.stop(id);
		}
		// A crashed instance is deleted before its respawn fires, so an org with a
		// pending respawn has no entry in `instances` for the loop above to reach.
		for (const id of Array.from(this.respawns.keys())) {
			this.clearRespawnState(id);
		}
	}

	async restart(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
		assertSafeOrganizationId(organizationId);
		const preferredPorts = this.getPreferredPorts(organizationId);
		this.stop(organizationId);
		return this.startWithPreferredPorts(organizationId, config, preferredPorts);
	}

	/**
	 * Forcefully reset host-service state for an org. Unlike `restart`, this
	 * SIGKILLs whatever pid the manifest names — even when no instance is
	 * tracked in this process (e.g. a stale manifest left by a CLI-spawned
	 * host-service) — then removes the manifest so callers can't pick up the
	 * stale entry, and respawns. Used by the recovery path for
	 * superset-sh/superset#4299 where a wedged host-service keeps serving
	 * stale state.
	 */
	async reset(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
		assertSafeOrganizationId(organizationId);
		// Capture the manifest pid *before* stop() — stop() removes the manifest
		// for tracked instances and only sends SIGTERM, which a wedged process
		// can ignore. We escalate to SIGKILL on whatever pid the manifest named.
		const preferredPorts = this.getPreferredPorts(organizationId);
		const manifestPid = readManifest(organizationId)?.pid;

		this.stop(organizationId);

		if (manifestPid != null && isProcessAlive(manifestPid)) {
			try {
				killProcess(manifestPid, "SIGKILL");
			} catch (error) {
				log.warn(
					`[host-service:${organizationId}] reset: SIGKILL of pid=${manifestPid} failed`,
					error,
				);
			}
		}

		removeManifest(organizationId);

		return this.startWithPreferredPorts(organizationId, config, preferredPorts);
	}

	getConnection(organizationId: string): Connection | null {
		const instance = this.instances.get(organizationId);
		if (!instance || instance.status !== "running") return null;
		return {
			port: instance.port,
			secret: instance.secret,
			machineId: this.machineId,
		};
	}

	/** Every currently-running local host-service connection, across all orgs. */
	getConnections(): Connection[] {
		return [...this.instances.values()]
			.filter((instance) => instance.status === "running")
			.map((instance) => ({
				port: instance.port,
				secret: instance.secret,
				machineId: this.machineId,
			}));
	}

	getProcessStatus(organizationId: string): HostServiceStatus {
		if (this.pendingStarts.has(organizationId)) return "starting";
		return this.instances.get(organizationId)?.status ?? "stopped";
	}

	getActiveOrganizationIds(): string[] {
		return [...this.instances.entries()]
			.filter(([, i]) => i.status !== "stopped")
			.map(([id]) => id);
	}

	async restartAll(config: SpawnConfig): Promise<void> {
		await Promise.all(
			this.getActiveOrganizationIds().map((orgId) =>
				this.restart(orgId, config),
			),
		);
	}

	/**
	 * Reconcile running host services to the authenticated membership set.
	 * On-disk host directories are storage, not evidence of current membership.
	 */
	async reconcile(
		organizationIds: Iterable<string>,
		config: SpawnConfig,
	): Promise<void> {
		this.startGeneration++;
		const reconciliationGeneration = this.startGeneration;
		this.desiredOrganizationIds = new Set(
			[...organizationIds].filter(isSafeOrganizationId),
		);
		this.stopUndesiredOrganizations();

		await Promise.all(
			[...this.desiredOrganizationIds].map(async (organizationId) => {
				try {
					await this.start(organizationId, config);
				} catch (error) {
					if (this.startGeneration !== reconciliationGeneration) return;
					if (!this.desiredOrganizationIds.has(organizationId)) return;
					log.warn(
						`[host-service-coordinator] start failed for org ${organizationId}:`,
						error,
					);
					if (!this.respawns.has(organizationId)) {
						this.scheduleRespawn(organizationId, "initial start failed");
					}
				}
			}),
		);

		// A newer reconciliation can replace the desired set while an older start
		// is in flight. Re-check after every start settles so the older call cannot
		// leave a service running for an organization that is no longer desired.
		this.stopUndesiredOrganizations();
	}

	private stopUndesiredOrganizations(): void {
		const trackedOrganizationIds = new Set([
			...this.instances.keys(),
			...this.pendingStarts.keys(),
			...this.respawns.keys(),
		]);
		for (const organizationId of trackedOrganizationIds) {
			if (!this.desiredOrganizationIds.has(organizationId)) {
				this.stop(organizationId);
			}
		}
	}

	/**
	 * Dev-only: watch the built host-service bundle and restart running
	 * instances when it changes. Gives a fast edit→reload loop for code
	 * under packages/host-service and src/main/host-service without
	 * restarting Electron. In-memory host-service state (PTYs, watchers,
	 * chat streams) is torn down on each reload — this is not true HMR.
	 */
	enableDevReload(
		configProvider: () => Promise<SpawnConfig | null>,
	): () => void {
		if (this.devReloadWatcher) return () => {};

		const scriptDir = path.dirname(this.scriptPath);
		const scriptFile = path.basename(this.scriptPath);
		let debounce: ReturnType<typeof setTimeout> | null = null;
		let reloading = false;

		const waitForStableBundle = async (): Promise<boolean> => {
			const deadline = Date.now() + 5_000;
			let lastSize = -1;
			let stableSince = 0;
			while (Date.now() < deadline) {
				try {
					const stat = fs.statSync(this.scriptPath);
					if (stat.size > 0 && stat.size === lastSize) {
						if (Date.now() - stableSince >= 150) return true;
					} else {
						lastSize = stat.size;
						stableSince = Date.now();
					}
				} catch {
					lastSize = -1;
					stableSince = 0;
				}
				await new Promise((r) => setTimeout(r, 50));
			}
			return false;
		};

		const trigger = () => {
			if (debounce) clearTimeout(debounce);
			debounce = setTimeout(() => {
				void (async () => {
					if (reloading) return;
					if (this.getActiveOrganizationIds().length === 0) return;
					reloading = true;
					try {
						const ready = await waitForStableBundle();
						if (!ready) {
							log.warn(
								"[host-service] bundle did not stabilize, skipping reload",
							);
							return;
						}
						const config = await configProvider();
						if (!config) return;
						log.info(
							"[host-service] bundle changed, restarting running instances",
						);
						await this.restartAll(config);
					} catch (error) {
						log.error("[host-service] dev reload failed:", error);
					} finally {
						reloading = false;
					}
				})();
			}, 250);
		};

		try {
			this.devReloadWatcher = fs.watch(scriptDir, (_event, filename) => {
				if (filename && filename !== scriptFile) return;
				trigger();
			});
		} catch (error) {
			log.error("[host-service] failed to enable dev reload:", error);
			return () => {};
		}

		return () => {
			if (debounce) clearTimeout(debounce);
			this.devReloadWatcher?.close();
			this.devReloadWatcher = null;
		};
	}

	// ── Adopt + single-flight spawn ────────────────────────────────────

	/**
	 * Single-flight a host-service for `organizationId` across every app
	 * instance sharing this machine's `$SUPERSET_HOME_DIR`.
	 *
	 * First tries to adopt a healthy host-service another instance already
	 * spawned (reading its manifest for port + secret). Otherwise it takes a
	 * cross-process spawn lock and spawns; a peer that can't get the lock waits
	 * for the winner's manifest to go healthy and adopts it, so only one child
	 * per org is ever spawned. Stale/dead-owner locks are stolen so a crashed or
	 * wedged instance never wedges everyone else.
	 */
	private async startOrAdopt(
		organizationId: string,
		config: SpawnConfig,
		preferredPorts: Iterable<number>,
		isStartAllowed: () => boolean,
	): Promise<Connection> {
		if (!isStartAllowed()) throw new Error("Host service start cancelled");
		const adopted = await this.tryAdopt(organizationId, isStartAllowed);
		if (adopted) return adopted;

		const deadline = Date.now() + START_OR_ADOPT_DEADLINE_MS;
		for (;;) {
			if (!isStartAllowed()) throw new Error("Host service start cancelled");
			const lock = acquireSpawnLock(organizationId, {
				staleMs: SPAWN_LOCK_STALE_MS,
			});
			if (lock) {
				try {
					// A peer may have finished spawning between our first adopt
					// attempt and taking the lock — re-check before spawning.
					const raced = await this.tryAdopt(organizationId, isStartAllowed);
					if (raced) return raced;
					await this.reapWedgedManifestHolder(organizationId);
					return await this.spawn(
						organizationId,
						config,
						preferredPorts,
						isStartAllowed,
					);
				} finally {
					lock.release();
				}
			}

			// A live peer holds the lock and is mid-spawn: wait for its manifest
			// to become healthy, then adopt it.
			const peer = await this.tryAdopt(organizationId, isStartAllowed);
			if (peer) return peer;

			if (Date.now() >= deadline) {
				throw new Error(
					`Timed out waiting to start or adopt host service for ${organizationId}`,
				);
			}
			await new Promise((r) => setTimeout(r, ADOPT_WAIT_INTERVAL_MS));
		}
	}

	/**
	 * Adopt a host-service another live app instance spawned, if its manifest
	 * points at a healthy endpoint. Registers a foreign-owned in-process entry
	 * and returns its connection, or null when there's nothing healthy to adopt.
	 */
	private async tryAdopt(
		organizationId: string,
		isStartAllowed: () => boolean,
	): Promise<Connection | null> {
		if (!isStartAllowed()) throw new Error("Host service start cancelled");
		const manifest = readManifest(organizationId);
		if (!manifest) return null;

		let port: number;
		try {
			port = Number(new URL(manifest.endpoint).port);
		} catch {
			return null;
		}
		if (!isValidPort(port)) return null;

		const healthy = await pollHealthCheck(
			manifest.endpoint,
			manifest.authToken,
			ADOPT_HEALTH_TIMEOUT_MS,
		);
		if (!healthy) return null;
		if (!isStartAllowed()) throw new Error("Host service start cancelled");

		const previous = this.instances.get(organizationId);
		this.instances.set(organizationId, {
			pid: manifest.pid,
			port,
			secret: manifest.authToken,
			status: "running",
			spawnedAt: manifest.startedAt,
			outputTail: "",
			// Adopted children are owned by another app instance: we never see
			// their stdio, so outputTail stays empty and this is belt-and-braces.
			redactions: [manifest.authToken],
			owned: false,
		});
		this.rememberPort(organizationId, port);
		// A later respawn must keep honoring credentials clients cached against
		// the adopted instance.
		this.stableSecrets.set(organizationId, manifest.authToken);
		this.emitStatus(organizationId, "running", previous?.status ?? null);

		log.info(
			`[host-service:${organizationId}] adopted existing host on port ${port} (pid ${manifest.pid})`,
		);
		return { port, secret: manifest.authToken, machineId: this.machineId };
	}

	// ── Spawn ─────────────────────────────────────────────────────────

	private async spawn(
		organizationId: string,
		config: SpawnConfig,
		preferredPorts: Iterable<number> = this.getPreferredPorts(organizationId),
		isStartAllowed: () => boolean = () => true,
	): Promise<Connection> {
		if (!isStartAllowed()) throw new Error("Host service start cancelled");
		const port = await findFreePort(preferredPorts);
		if (!isStartAllowed()) throw new Error("Host service start cancelled");
		this.rememberPort(organizationId, port);
		const secret = this.getOrCreateSecret(organizationId);

		const instance: HostServiceProcess = {
			pid: 0,
			port,
			secret,
			status: "starting",
			spawnedAt: Date.now(),
			outputTail: "",
			// Redact every live credential in the child env from crash tails
			// shipped to Sentry — incl. the browser-bridge secret.
			redactions: [
				secret,
				config.authToken,
				getBrowserBridgeInfo()?.secret,
			].filter((value): value is string => Boolean(value)),
			owned: true,
		};
		this.instances.set(organizationId, instance);
		this.emitStatus(organizationId, "starting", null);

		const childEnv = await this.buildEnv(organizationId, port, secret, config);
		if (!isStartAllowed()) {
			if (this.instances.get(organizationId) === instance) {
				this.instances.delete(organizationId);
			}
			throw new Error("Host service start cancelled");
		}
		const logFd = openRotatingLogFd(
			path.join(manifestDir(organizationId), "host-service.log"),
			MAX_HOST_LOG_BYTES,
		);
		// Output is piped rather than handing the log fd straight to the child so
		// the coordinator can keep a tail of it for crash reports; it is written
		// through to the same rotating log file (and, in dev, to this process's
		// stdout/stderr) so logging is unchanged.
		const isDev = !app.isPackaged;
		const logStream =
			logFd >= 0 ? fs.createWriteStream("", { fd: logFd }) : null;
		// An unhandled stream error would take down the main process; losing log
		// lines must not.
		logStream?.on("error", () => {});

		let child: ReturnType<typeof childProcess.spawn>;
		try {
			child = childProcess.spawn(process.execPath, [this.scriptPath], {
				detached: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: childEnv,
				// Avoid a flashing CMD window on Windows.
				windowsHide: true,
			});
		} catch (error) {
			logStream?.end();
			throw error;
		}

		for (const source of [child.stdout, child.stderr]) {
			source?.on("error", () => {});
			source?.on("data", (chunk: Buffer) => {
				instance.outputTail = (
					instance.outputTail + chunk.toString("utf8")
				).slice(-MAX_OUTPUT_TAIL_BYTES);
				logStream?.write(chunk);
			});
		}
		child.once("close", () => logStream?.end());

		// In dev, fan child output through to parent stdout/stderr with a
		// prefix so it's identifiable in `bun dev`.
		if (isDev && child.stdout && child.stderr) {
			const tag = `[hs:${organizationId.slice(0, 8)}]`;
			pipeWithPrefix(child.stdout, process.stdout, tag);
			pipeWithPrefix(child.stderr, process.stderr, tag);
		}

		const childPid = child.pid;
		if (!childPid) {
			logStream?.end();
			this.instances.delete(organizationId);
			throw new Error("Failed to spawn host service process");
		}

		instance.pid = childPid;
		let childExited = false;
		child.on("exit", (code, signal) => {
			childExited = true;
			this.handleChildExit(organizationId, childPid, code, signal);
		});
		// Don't let the child block Electron's exit — stopAll() handles teardown.
		child.unref();

		const endpoint = `http://127.0.0.1:${port}`;
		const healthy = await pollHealthCheck(
			endpoint,
			secret,
			HEALTH_POLL_TIMEOUT_MS,
			() => childExited || !isStartAllowed(),
		);
		if (!healthy || !isStartAllowed()) {
			if (!childExited) child.kill("SIGTERM");
			if (this.instances.get(organizationId) === instance) {
				this.instances.delete(organizationId);
			}
			// Whether cancelled or failed-to-start, the dying child must not
			// leave a manifest naming its dead pid (the CLI would report
			// "manifest is stale" instead of the clean no-manifest path).
			if (childPid != null) {
				this.removeManifestIfHeldBy(organizationId, childPid);
			}
			throw new Error(
				!isStartAllowed()
					? "Host service start cancelled"
					: childExited
						? "Host service process exited during startup"
						: `Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
			);
		}

		instance.status = "running";

		log.info(`[host-service:${organizationId}] listening on port ${port}`);
		this.emitStatus(organizationId, "running", "starting");
		return { port, secret, machineId: this.machineId };
	}

	private async buildEnv(
		organizationId: string,
		port: number,
		secret: string,
		config: SpawnConfig,
	): Promise<Record<string, string>> {
		const organizationDir = manifestDir(organizationId);
		const row = localDb.select().from(settings).get();
		const exposeViaRelay = row?.exposeHostServiceViaRelay ?? false;
		const browserBridge = getBrowserBridgeInfo();

		const childEnv = await getProcessEnvWithShellPath({
			...(process.env as Record<string, string>),
			ELECTRON_RUN_AS_NODE: "1",
			NODE_ENV: app.isPackaged
				? "production"
				: (process.env.NODE_ENV ?? "development"),
			ORGANIZATION_ID: organizationId,
			HOST_CLIENT_ID: getHostId(),
			HOST_NAME: getHostName(),
			HOST_SERVICE_SECRET: secret,
			HOST_SERVICE_PORT: String(port),
			HOST_MANIFEST_DIR: organizationDir,
			HOST_DB_PATH: path.join(organizationDir, "host.db"),
			HOST_MIGRATIONS_FOLDER: app.isPackaged
				? path.join(process.resourcesPath, "resources/host-migrations")
				: path.join(app.getAppPath(), "../../packages/host-service/drizzle"),
			// chat.db's migrations ship the same way host.db's do: the bundled
			// host-service can't resolve them from its own module path, so the
			// folder travels as a resource and the path comes in as env.
			SUPERSET_CHAT_V3_MIGRATIONS: app.isPackaged
				? path.join(process.resourcesPath, "resources/chat-migrations")
				: path.join(
						app.getAppPath(),
						"../../packages/chat-runtime/src/db/drizzle",
					),
			// The Claude Agent SDK's bundled CLI binary is unresolvable from the
			// bundled host-service (isolated linker + bundling), so its path comes
			// in as env too. Packaged builds are an open IOU (231MB binary).
			...(chatV3ClaudeBin()
				? { SUPERSET_CHAT_V3_CLAUDE_BIN: chatV3ClaudeBin() as string }
				: {}),
			DESKTOP_VITE_PORT: String(sharedEnv.DESKTOP_VITE_PORT),
			SUPERSET_HOME_DIR: SUPERSET_HOME_DIR,
			SUPERSET_LEGACY_WORKTREE_BASE_DIR: row?.worktreeBaseDir ?? "",
			SUPERSET_AGENT_HOOK_PORT: String(sharedEnv.DESKTOP_NOTIFICATIONS_PORT),
			SUPERSET_AGENT_HOOK_VERSION: HOOK_PROTOCOL_VERSION,
			// BROWSER_BRIDGE_URL/SECRET are set (or stripped) after the shell-env
			// merge below, alongside RELAY_URL, so an inherited value can't leak
			// into a standalone host.
			AUTH_TOKEN: config.authToken,
			SUPERSET_AUTH_CONFIG_PATH: path.join(SUPERSET_HOME_DIR, "config.json"),
			SUPERSET_API_URL: config.cloudApiUrl,
			// Namespaced so terminals/agents spawned by the host service don't
			// inherit a generic SENTRY_DSN — third-party tools with a Sentry SDK
			// auto-pick it up and report into our project.
			...(app.isPackaged && mainEnv.SENTRY_DSN_HOST_SERVICE
				? {
						HOST_SERVICE_SENTRY_DSN: mainEnv.SENTRY_DSN_HOST_SERVICE,
						HOST_SERVICE_SENTRY_RELEASE: app.getVersion(),
						HOST_SERVICE_SENTRY_ENVIRONMENT: "production",
					}
				: {}),
			// Read by the child's parent watchdog so it can self-exit if
			// Electron crashes without sending SIGTERM (orphan reparenting).
			HOST_PARENT_PID: String(process.pid),
		});

		// `getProcessEnvWithShellPath` merges in the user's interactive shell env,
		// which in dev has `RELAY_URL` set. Enforce the toggle *after* that merge
		// so the child definitely doesn't see a relay URL when disabled. The
		// effective URL comes from the PostHog `relay-url-override` flag with
		// `env.RELAY_URL` as fallback (see main/lib/relay-url) so we can A/B-test
		// alternate relay deployments per-user.
		const effectiveRelayUrl = getRelayUrl();
		if (exposeViaRelay && effectiveRelayUrl) {
			childEnv.RELAY_URL = effectiveRelayUrl;
		} else {
			delete childEnv.RELAY_URL;
		}

		// Same enforce-after-merge for the browser bridge: when this process has
		// no bridge, strip any inherited BROWSER_BRIDGE_* so the child can't
		// connect to a stale/unintended bridge from the shell env.
		if (browserBridge) {
			childEnv.BROWSER_BRIDGE_URL = browserBridge.endpoint;
			childEnv.BROWSER_BRIDGE_SECRET = browserBridge.secret;
		} else {
			delete childEnv.BROWSER_BRIDGE_URL;
			delete childEnv.BROWSER_BRIDGE_SECRET;
		}

		return childEnv;
	}

	// ── Events ────────────────────────────────────────────────────────

	private emitStatus(
		organizationId: string,
		status: HostServiceStatus,
		previousStatus: HostServiceStatus | null,
	): void {
		this.emit("status-changed", {
			organizationId,
			status,
			previousStatus,
		} satisfies HostServiceStatusEvent);
	}

	/**
	 * Reconcile state after a spawned child exits, and schedule a respawn when it
	 * crashed. Extracted from the `exit` listener so it is reachable from tests:
	 * the suite stubs `spawn` wholesale, so the inline listener never ran.
	 *
	 * Returns early for an exit that is not a crash of *this* running child: a
	 * deliberate `stop()` (which marks the instance stopped first), a stale
	 * listener whose pid has been replaced, and startup deaths, which surface
	 * through `start()` rejecting rather than here.
	 */
	private handleChildExit(
		organizationId: string,
		childPid: number,
		code: number | null,
		signal: NodeJS.Signals | null,
	): void {
		log.info(
			`[host-service:${organizationId}] pid=${childPid} exited with code ${code} signal ${signal}`,
		);
		this.cancelKillEscalation(childPid);
		const current = this.instances.get(organizationId);
		if (!current || current.pid !== childPid || current.status === "stopped")
			return;

		const previousStatus = current.status;
		this.rememberPort(organizationId, current.port);
		this.instances.delete(organizationId);
		this.removeManifestIfHeldBy(organizationId, childPid);
		this.emitStatus(organizationId, "stopped", previousStatus);

		if (previousStatus !== "running") return;

		const cause =
			signal != null ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
		log.error(`[host-service:${organizationId}] crashed (${cause})`);
		// The child cannot report its own death for hard kills (SIGSEGV, OOM),
		// so the supervisor is the only place these are observable. Imported
		// lazily: a static @sentry/electron import needs electron APIs the
		// coordinator tests' stub does not provide.
		const respawnAttempts = this.respawns.get(organizationId)?.attempts ?? 0;
		const flushTimer = setTimeout(() => {
			void import("@sentry/electron/main")
				.then((Sentry) =>
					Sentry.captureMessage(`host-service crashed (${cause})`, {
						level: "error",
						tags: {
							exit_code: String(code ?? "none"),
							exit_signal: signal ?? "none",
						},
						extra: {
							organizationId,
							respawnAttempts,
							pid: childPid,
							version: app.getVersion(),
							uptimeMs: Date.now() - current.spawnedAt,
							outputTail: current.redactions.reduce(
								(tail, secret) => tail.split(secret).join("[redacted]"),
								current.outputTail,
							),
						},
					}),
				)
				.catch(() => {});
		}, CRASH_REPORT_FLUSH_MS);
		flushTimer.unref?.();
		this.scheduleRespawn(organizationId, cause);
	}

	/**
	 * Queue the next respawn attempt, or give up and tell the user once the
	 * budget is spent. Giving up is what surfaces the dialog now: a crash that
	 * heals itself should be a log line, not a modal that blocks the main
	 * process.
	 */
	private scheduleRespawn(organizationId: string, cause: string): void {
		const state = this.respawns.get(organizationId) ?? {
			attempts: 0,
			timer: null,
			stableTimer: null,
		};
		this.respawns.set(organizationId, state);

		const delay = nextRespawnDelayMs(state.attempts);
		if (delay === null) {
			log.error(
				`[host-service:${organizationId}] giving up after ${state.attempts} respawn attempts`,
			);
			this.clearRespawnState(organizationId);
			this.alertChildCrashed(organizationId, cause);
			return;
		}

		state.attempts += 1;
		const attempt = state.attempts;
		log.info(
			`[host-service:${organizationId}] respawn attempt ${attempt} in ${Math.round(delay)}ms`,
		);
		if (state.timer) clearTimeout(state.timer);
		state.timer = this.scheduleRespawnTimer(() => {
			state.timer = null;
			void this.respawn(organizationId, attempt, state);
		}, delay);
		// A pending respawn must not keep Electron alive on quit.
		state.timer.unref?.();
	}

	/**
	 * Re-spawn through the normal start path so port preference, the spawn lock
	 * and adoption all still apply. Config is re-read rather than reused: see
	 * `setConfigProvider`.
	 */
	private async respawn(
		organizationId: string,
		attempt: number,
		state: RespawnState,
	): Promise<void> {
		// Cancelling a timer only helps before it fires. Past that point this runs
		// across two awaits, and a stop() or stopAll() in either gap must abandon
		// the attempt: otherwise a fresh child is spawned and registered after
		// teardown and outlives the shutdown meant to end it. `clearRespawnState`
		// drops the state object, so losing our identity in the map is the signal.
		const cancelled = () => this.respawns.get(organizationId) !== state;

		if (!this.configProvider) {
			log.error(
				`[host-service:${organizationId}] cannot respawn: no config provider registered`,
			);
			this.clearRespawnState(organizationId);
			this.alertChildCrashed(organizationId, "no config provider");
			return;
		}

		try {
			const config = await this.configProvider();
			if (cancelled()) {
				log.info(
					`[host-service:${organizationId}] respawn attempt ${attempt} abandoned: stopped while reading config`,
				);
				return;
			}
			if (!config) {
				// Not treated as a deliberate sign-out: `loadToken` returns null for a
				// failed read or decrypt too, and signing out already tears the service
				// down through stopAll. So retry rather than abandoning recovery for
				// what is most likely transient.
				log.warn(
					`[host-service:${organizationId}] respawn attempt ${attempt}: no config available`,
				);
				this.scheduleRespawn(organizationId, "no auth token available");
				return;
			}
			await this.startWithPreferredPorts(
				organizationId,
				config,
				this.getPreferredPorts(organizationId),
			);
			if (cancelled()) {
				log.info(
					`[host-service:${organizationId}] respawned but stopped meanwhile; tearing the child back down`,
				);
				this.stop(organizationId);
				return;
			}
			log.info(
				`[host-service:${organizationId}] respawned on attempt ${attempt}`,
			);
			this.armRespawnBudgetReset(organizationId);
		} catch (error) {
			if (cancelled()) return;
			log.error(
				`[host-service:${organizationId}] respawn attempt ${attempt} failed:`,
				error,
			);
			this.scheduleRespawn(organizationId, `respawn attempt ${attempt} failed`);
		}
	}

	/**
	 * Restore the attempt budget once a respawn has held for a while, so an app
	 * left open for days does not spend its budget on unrelated crashes and then
	 * stop healing.
	 */
	private armRespawnBudgetReset(organizationId: string): void {
		const state = this.respawns.get(organizationId);
		const instance = this.instances.get(organizationId);
		if (!state || instance?.status !== "running") return;
		if (state.stableTimer) clearTimeout(state.stableTimer);
		// Bind the reset to the instance that earned it. Checking only "something
		// is running" would let this credit a different child, including an adopted
		// one belonging to another app instance, and refill a budget the current
		// child never stabilised.
		state.stableTimer = this.scheduleRespawnTimer(() => {
			if (
				this.respawns.get(organizationId) === state &&
				this.instances.get(organizationId) === instance &&
				instance.status === "running"
			) {
				this.clearRespawnState(organizationId);
			}
		}, HOST_SERVICE_RESPAWN_STABLE_MS);
		state.stableTimer.unref?.();
	}

	/** Drop all respawn bookkeeping and cancel anything still pending. */
	private clearRespawnState(organizationId: string): void {
		const state = this.respawns.get(organizationId);
		if (!state) return;
		if (state.timer) clearTimeout(state.timer);
		if (state.stableTimer) clearTimeout(state.stableTimer);
		this.respawns.delete(organizationId);
	}

	/**
	 * SIGTERM is a request the child can fail to honour: a host-worker wedged
	 * in native code leaves `process.exit()` blocked joining it, and the child
	 * then ignores every later SIGTERM. Follow up with SIGKILL after a grace.
	 * Unref'd on purpose: on quit the parent must not wait around for this,
	 * and the startup reap in `reapWedgedManifestHolder` covers a child that
	 * outlives us.
	 */
	private scheduleKillEscalation(organizationId: string, pid: number): void {
		this.cancelKillEscalation(pid);
		const timer = this.scheduleRespawnTimer(() => {
			// A cancelled escalation (the child exited, `handleChildExit` ran) is
			// no longer the registered one; never signal a pid we know is gone.
			if (this.killEscalations.get(pid) !== timer) return;
			this.killEscalations.delete(pid);
			if (!isProcessAlive(pid)) return;
			log.warn(
				`[host-service:${organizationId}] pid=${pid} still alive ${STOP_KILL_ESCALATION_MS}ms after SIGTERM; escalating to SIGKILL`,
			);
			try {
				killProcess(pid, "SIGKILL");
			} catch (error) {
				log.warn(
					`[host-service:${organizationId}] SIGKILL of pid=${pid} failed`,
					error,
				);
			}
		}, STOP_KILL_ESCALATION_MS);
		timer.unref?.();
		this.killEscalations.set(pid, timer);
	}

	private cancelKillEscalation(pid: number): void {
		const timer = this.killEscalations.get(pid);
		if (!timer) return;
		clearTimeout(timer);
		this.killEscalations.delete(pid);
	}

	/**
	 * Kill a manifest holder that is alive but failed the adopt health probe
	 * before spawning beside it. That holder is a wedged host-service: in
	 * practice an orphan of a Squirrel auto-update relaunch whose exit hung
	 * joining a stuck worker. Left alone it keeps the port (the replacement
	 * ends up on a fallback port) and its pty-daemon subscriptions, which
	 * freezes those terminals for the replacement too. Runs under the spawn
	 * lock, right after the under-lock adopt miss, so the probe verdict is
	 * fresh. A pid started before this boot is skipped: pids recycle across
	 * reboots, and a pre-boot `startedAt` can name any process at all.
	 *
	 * Pids recycle within a boot too, and `kill(pid, 0)` only proves *a*
	 * process exists. So before SIGKILL the live process must look like the
	 * host-service that wrote the manifest: our script on its command line and
	 * an age consistent with `startedAt`. Anything else, including a pid `ps`
	 * cannot inspect, is left alone.
	 */
	private async reapWedgedManifestHolder(
		organizationId: string,
	): Promise<void> {
		const manifest = readManifest(organizationId);
		if (!manifest || !isProcessAlive(manifest.pid)) return;
		// tryAdopt() returns null without probing when the endpoint is
		// unparsable; only a probed miss is evidence of a wedge.
		let port: number | null = null;
		try {
			port = Number(new URL(manifest.endpoint).port);
		} catch {}
		if (!isValidPort(port)) return;
		const bootedAt = Date.now() - os.uptime() * 1000;
		if (manifest.startedAt < bootedAt) return;

		const identity = await this.inspectProcess(manifest.pid);
		const processStartedAt =
			identity == null ? null : Date.now() - identity.elapsedMs;
		const looksLikeHolder =
			identity != null &&
			processStartedAt != null &&
			identity.command.includes(path.basename(this.scriptPath)) &&
			processStartedAt >= manifest.startedAt - REAP_IDENTITY_MAX_OLDER_MS &&
			processStartedAt <= manifest.startedAt + REAP_IDENTITY_MAX_YOUNGER_MS;
		if (!looksLikeHolder) {
			log.warn(
				`[host-service:${organizationId}] manifest pid=${manifest.pid} is alive but unhealthy and does not look like the host-service that wrote the manifest (${identity ? `"${identity.command}", age ${Math.round(identity.elapsedMs / 1000)}s` : "not inspectable"}); leaving it alone`,
			);
			return;
		}

		log.warn(
			`[host-service:${organizationId}] manifest pid=${manifest.pid} at ${manifest.endpoint} is alive but unhealthy; SIGKILLing it before spawning`,
		);
		try {
			killProcess(manifest.pid, "SIGKILL");
		} catch (error) {
			log.warn(
				`[host-service:${organizationId}] reap: SIGKILL of pid=${manifest.pid} failed`,
				error,
			);
		}
		// SIGKILL is asynchronous: give the kernel a moment to tear the process
		// down so spawn()'s findFreePort sees its preferred port free instead
		// of falling back to a random one.
		const exited = await this.waitForExit(manifest.pid, REAP_EXIT_WAIT_MS);
		if (!exited) {
			log.warn(
				`[host-service:${organizationId}] reap: pid=${manifest.pid} still alive ${REAP_EXIT_WAIT_MS}ms after SIGKILL`,
			);
		}
		this.removeManifestIfHeldBy(organizationId, manifest.pid);
	}

	private async waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
		const deadline = Date.now() + timeoutMs;
		while (isProcessAlive(pid)) {
			if (Date.now() >= deadline) return false;
			await new Promise((r) => setTimeout(r, REAP_EXIT_POLL_MS));
		}
		return true;
	}

	/**
	 * Alert on a crash we could not recover from. Recovery is the existing
	 * tray > Host Service > Restart. Async on purpose: a synchronous error box
	 * blocks the main process until dismissed.
	 */
	private alertChildCrashed(organizationId: string, cause: string): void {
		const orgName = this.getOrganizationName(organizationId);
		void dialog.showMessageBox({
			type: "error",
			title: i18n._(
				msg({
					message: "Host service crashed",
				}),
			),
			message: orgName
				? i18n._({
						...msg({
							message:
								"The Superset host service for {organization} stopped unexpectedly ({cause}) and could not be restarted automatically.",
						}),
						values: { organization: orgName, cause },
					})
				: i18n._({
						...msg({
							message:
								"The Superset host service stopped unexpectedly ({cause}) and could not be restarted automatically.",
						}),
						values: { cause },
					}),
			detail: i18n._(
				msg({
					message:
						"Its workspaces and terminals are unavailable until it restarts — use the Superset tray menu > Host Service > Restart.",
				}),
			),
		});
	}

	private getOrganizationName(organizationId: string): string | null {
		try {
			const row = localDb
				.select({ name: organizations.name })
				.from(organizations)
				.where(eq(organizations.id, organizationId))
				.get();
			return row?.name ?? null;
		} catch {
			return null;
		}
	}
}

/**
 * Forward child stdout/stderr to a parent stream with a per-line prefix.
 * Plain `chunk => parent.write(`${tag} ${chunk}`)` only prefixes the first
 * line in a chunk and breaks visual scanning when child output bursts.
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
		// Last element is a partial line if input doesn't end with \n;
		// stash it for the next chunk.
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

let coordinator: HostServiceCoordinator | null = null;

export function getHostServiceCoordinator(): HostServiceCoordinator {
	if (!coordinator) {
		coordinator = new HostServiceCoordinator();
	}
	return coordinator;
}

function chatV3ClaudeBin(): string | undefined {
	if (app.isPackaged) return undefined;
	const arch = process.arch;
	const platform = process.platform;
	const store = path.join(app.getAppPath(), "../../node_modules/.bun");
	const prefix = `@anthropic-ai+claude-agent-sdk-${platform}-${arch}@`;
	try {
		const entry = fs.readdirSync(store).find((d) => d.startsWith(prefix));
		if (!entry) return undefined;
		const bin = path.join(
			store,
			entry,
			`node_modules/@anthropic-ai/claude-agent-sdk-${platform}-${arch}/claude`,
		);
		return fs.existsSync(bin) ? bin : undefined;
	} catch {
		return undefined;
	}
}
