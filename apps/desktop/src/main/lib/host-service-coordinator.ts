import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import path from "node:path";
import { settings } from "@superset/local-db";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { app, dialog } from "electron";
import log from "electron-log/main";
import { env as sharedEnv } from "shared/env.shared";
import { getProcessEnvWithShellPath } from "../../lib/trpc/routers/workspaces/utils/shell-env";
import { SUPERSET_HOME_DIR } from "./app-environment";
import { isInternalBuild } from "./build-channel";
import { acquireSpawnLock } from "./host-service-lock";
import {
	isProcessAlive,
	killProcess,
	manifestDir,
	readManifest,
	removeManifest,
} from "./host-service-manifest";
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

interface HostServiceProcess {
	pid: number;
	port: number;
	secret: string;
	status: HostServiceStatus;
	/**
	 * True when this instance spawned the child and owns its lifecycle (may
	 * SIGTERM it and remove its manifest). False when the entry was *adopted*
	 * from another live app instance's host-service — we connect to it but must
	 * never kill it or delete its manifest.
	 */
	owned: boolean;
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

// High, uncommon user-space range: above usual web/dev server ports and below
// macOS's default ephemeral range, while still falling back if occupied.
const STABLE_PORT_BASE = 48_000;
const STABLE_PORT_COUNT = 1_000;

// A "running" child can wedge without exiting (blocked event loop, fd
// exhaustion) — the exit listener never fires, so the coordinator keeps
// reporting it as healthy while every renderer request fails with
// "Failed to fetch" (superset-sh/superset#5699). The watchdog probes each
// running instance and force-restarts it after enough consecutive failures.
export const HEALTH_WATCHDOG_INTERVAL_MS = 15_000;
export const HEALTH_WATCHDOG_PROBE_TIMEOUT_MS = 3_000;
export const HEALTH_WATCHDOG_FAILURE_THRESHOLD = 3;

function getStablePortForOrganization(organizationId: string): number {
	let hash = 2_166_136_261;
	for (let index = 0; index < organizationId.length; index++) {
		hash ^= organizationId.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return STABLE_PORT_BASE + ((hash >>> 0) % STABLE_PORT_COUNT);
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
	private pendingStarts = new Map<string, Promise<Connection>>();
	private lastKnownPorts = new Map<string, number>();
	private scriptPath = path.join(__dirname, "host-service.js");
	private machineId = getHostId();
	private devReloadWatcher: fs.FSWatcher | null = null;
	private watchdogTimer: ReturnType<typeof setInterval> | null = null;
	private watchdogTickInFlight = false;
	/**
	 * Consecutive failed health probes per org, bound to the probed child's
	 * pid so a freshly-spawned child never inherits its predecessor's count.
	 * Entries at/over the threshold whose org has no live instance mark a
	 * failed recovery that the watchdog keeps retrying each tick.
	 */
	private watchdogFailures = new Map<string, { pid: number; count: number }>();

	async start(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
		return this.startWithPreferredPorts(organizationId, config);
	}

	private async startWithPreferredPorts(
		organizationId: string,
		config: SpawnConfig,
		preferredPorts?: Iterable<number>,
	): Promise<Connection> {
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
		if (pending) return pending;

		const startPromise = this.startOrAdopt(
			organizationId,
			config,
			preferredPorts ?? this.getPreferredPorts(organizationId),
		);
		this.pendingStarts.set(organizationId, startPromise);

		try {
			return await startPromise;
		} finally {
			this.pendingStarts.delete(organizationId);
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

	stop(organizationId: string): void {
		// A deliberate stop disarms the watchdog for this org — it must not
		// auto-respawn something the caller just chose to shut down.
		this.watchdogFailures.delete(organizationId);

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
				killProcess(instance.pid, "SIGTERM");
			} catch {}
			removeManifest(organizationId);
		}

		this.instances.delete(organizationId);
		this.emitStatus(organizationId, "stopped", previousStatus);
	}

	stopAll(): void {
		for (const [id] of this.instances) {
			this.stop(id);
		}
	}

	async restart(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
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
		opts: { alsoKillPid?: number } = {},
	): Promise<Connection> {
		// Capture the manifest pid *before* stop() — stop() removes the manifest
		// for tracked instances and only sends SIGTERM, which a wedged process
		// can ignore. We escalate to SIGKILL on whatever pid the manifest named,
		// plus any caller-provided pid (the watchdog passes the wedged child's
		// tracked pid, which can differ from the manifest when the manifest is
		// missing or stale). Escalation happens here, before the slow respawn,
		// so the pid can't be recycled by the OS in the meantime.
		const preferredPorts = this.getPreferredPorts(organizationId);
		const manifestPid = readManifest(organizationId)?.pid;

		this.stop(organizationId);

		const pidsToKill = new Set<number>();
		if (manifestPid != null) pidsToKill.add(manifestPid);
		if (opts.alsoKillPid != null) pidsToKill.add(opts.alsoKillPid);
		for (const pid of pidsToKill) {
			if (!isProcessAlive(pid)) continue;
			try {
				killProcess(pid, "SIGKILL");
			} catch (error) {
				log.warn(
					`[host-service:${organizationId}] reset: SIGKILL of pid=${pid} failed`,
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
	 * Start host services for every org this machine has hosted before
	 * ($SUPERSET_HOME_DIR/host/*). Runs at boot and on sign-in so background
	 * reachability and port detection never wait for a renderer or cloud sync
	 * to name orgs; a brand-new org (no dir yet) is started by the renderer
	 * from its session.
	 */
	async startAllKnown(config: SpawnConfig): Promise<void> {
		const hostRoot = path.join(SUPERSET_HOME_DIR, "host");
		let entries: fs.Dirent[];
		try {
			entries = await fs.promises.readdir(hostRoot, { withFileTypes: true });
		} catch (error) {
			// No dir yet = nothing hosted before; anything else is worth seeing.
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				log.warn(
					`[host-service-coordinator] cannot read host root ${hostRoot}:`,
					error,
				);
			}
			return;
		}
		const orgIdPattern = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
		await Promise.allSettled(
			entries
				.filter((e) => e.isDirectory() && orgIdPattern.test(e.name))
				.map((e) =>
					this.start(e.name, config).catch((error) => {
						log.warn(
							`[host-service-coordinator] boot start failed for org ${e.name}:`,
							error,
						);
					}),
				),
		);
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
	): Promise<Connection> {
		const adopted = await this.tryAdopt(organizationId);
		if (adopted) return adopted;

		const deadline = Date.now() + START_OR_ADOPT_DEADLINE_MS;
		for (;;) {
			const lock = acquireSpawnLock(organizationId, {
				staleMs: SPAWN_LOCK_STALE_MS,
			});
			if (lock) {
				try {
					// A peer may have finished spawning between our first adopt
					// attempt and taking the lock — re-check before spawning.
					const raced = await this.tryAdopt(organizationId);
					if (raced) return raced;
					return await this.spawn(organizationId, config, preferredPorts);
				} finally {
					lock.release();
				}
			}

			// A live peer holds the lock and is mid-spawn: wait for its manifest
			// to become healthy, then adopt it.
			const peer = await this.tryAdopt(organizationId);
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
	private async tryAdopt(organizationId: string): Promise<Connection | null> {
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

		const previous = this.instances.get(organizationId);
		this.instances.set(organizationId, {
			pid: manifest.pid,
			port,
			secret: manifest.authToken,
			status: "running",
			owned: false,
		});
		this.rememberPort(organizationId, port);
		this.emitStatus(organizationId, "running", previous?.status ?? null);

		log.info(
			`[host-service:${organizationId}] adopted existing host on port ${port} (pid ${manifest.pid})`,
		);
		return { port, secret: manifest.authToken, machineId: this.machineId };
	}

	/**
	 * Periodically health-check every "running" instance and force-restart the
	 * ones that stop responding. The exit listener only catches children that
	 * die; a wedged child stays "running" forever and the only recovery today
	 * is the manual tray restart (or rebooting the machine).
	 */
	enableHealthWatchdog(
		configProvider: () => Promise<SpawnConfig | null>,
	): () => void {
		if (this.watchdogTimer) return () => {};

		const timer = setInterval(() => {
			void this.runWatchdogTick(configProvider);
		}, HEALTH_WATCHDOG_INTERVAL_MS);
		timer.unref();
		this.watchdogTimer = timer;

		return () => {
			clearInterval(timer);
			this.watchdogTimer = null;
			this.watchdogFailures.clear();
		};
	}

	private async runWatchdogTick(
		configProvider: () => Promise<SpawnConfig | null>,
	): Promise<void> {
		// A wedged instance makes each probe wait out its full timeout — skip
		// the tick instead of stacking probes against the same instance.
		if (this.watchdogTickInFlight) return;
		this.watchdogTickInFlight = true;

		try {
			for (const [organizationId, instance] of [...this.instances]) {
				if (
					instance.status !== "running" ||
					this.pendingStarts.has(organizationId)
				) {
					continue;
				}

				// Only supervise children we own. An adopted entry (owned=false)
				// points at another live app instance's host-service — force-
				// restarting it would SIGKILL a process we don't control. That
				// instance runs its own watchdog; if its owner has died the entry
				// is dropped lazily on the next startWithPreferredPorts.
				if (!instance.owned) continue;

				const healthy = await pollHealthCheck(
					`http://127.0.0.1:${instance.port}`,
					instance.secret,
					HEALTH_WATCHDOG_PROBE_TIMEOUT_MS,
				);

				// The instance may have been stopped or replaced while the probe
				// was in flight — a stale probe result must not count against the
				// replacement child.
				const current = this.instances.get(organizationId);
				if (
					!current ||
					current.pid !== instance.pid ||
					current.status !== "running"
				) {
					continue;
				}

				if (healthy) {
					this.watchdogFailures.delete(organizationId);
					continue;
				}

				// Bind the count to this child's pid: a freshly-spawned child
				// starts from 1 instead of inheriting its predecessor's failures.
				const prev = this.watchdogFailures.get(organizationId);
				const failureCount = prev?.pid === instance.pid ? prev.count + 1 : 1;
				this.watchdogFailures.set(organizationId, {
					pid: instance.pid,
					count: failureCount,
				});
				log.warn(
					`[host-service:${organizationId}] health check failed (${failureCount}/${HEALTH_WATCHDOG_FAILURE_THRESHOLD}) on port ${instance.port}`,
				);
				if (failureCount < HEALTH_WATCHDOG_FAILURE_THRESHOLD) continue;

				// Keep the counter until recovery actually runs — if no config is
				// available (logged out) the watchdog stays armed and retries on
				// the next tick instead of waiting out a full threshold again.
				const config = await configProvider();
				if (!config) continue;

				// Revalidate after the await — a manual restart may have replaced
				// the child while the config was being fetched.
				const latest = this.instances.get(organizationId);
				if (
					!latest ||
					latest.pid !== instance.pid ||
					latest.status !== "running" ||
					this.pendingStarts.has(organizationId)
				) {
					this.watchdogFailures.delete(organizationId);
					continue;
				}

				log.error(
					`[host-service:${organizationId}] unresponsive for ${HEALTH_WATCHDOG_FAILURE_THRESHOLD} consecutive health checks — force-restarting`,
				);
				try {
					// alsoKillPid escalates the wedged child to SIGKILL inside
					// reset(), after stop() but before the slow respawn — waiting
					// until reset() returned would leave a window where the pid is
					// recycled and the SIGKILL hits an innocent process.
					await this.reset(organizationId, config, {
						alsoKillPid: instance.pid,
					});
					this.watchdogFailures.delete(organizationId);
				} catch (error) {
					log.error(
						`[host-service:${organizationId}] watchdog restart failed:`,
						error,
					);
					// reset()'s stop() disarmed the entry; re-arm it so the
					// no-instance retry pass below keeps trying on later ticks.
					this.watchdogFailures.set(organizationId, {
						pid: instance.pid,
						count: failureCount,
					});
				}
			}

			// Orgs whose recovery failed have no tracked instance and are
			// invisible to the loop above — keep retrying those each tick until
			// a spawn sticks. Deliberate stops never land here: stop() disarms
			// the entry.
			for (const [organizationId, entry] of [...this.watchdogFailures]) {
				if (
					this.instances.has(organizationId) ||
					this.pendingStarts.has(organizationId)
				) {
					continue;
				}
				if (entry.count < HEALTH_WATCHDOG_FAILURE_THRESHOLD) {
					// Stale sub-threshold entry (e.g. the child crashed on its
					// own after a blip) — nothing to recover, drop it.
					this.watchdogFailures.delete(organizationId);
					continue;
				}
				const config = await configProvider();
				if (!config) continue;
				// Revalidate after the await — a concurrent stop() disarms the
				// entry (deliberate shutdown) and a concurrent start() makes the
				// respawn redundant; neither must be overridden here.
				if (
					this.watchdogFailures.get(organizationId) !== entry ||
					this.instances.has(organizationId) ||
					this.pendingStarts.has(organizationId)
				) {
					continue;
				}
				log.warn(
					`[host-service:${organizationId}] retrying respawn after failed watchdog recovery`,
				);
				try {
					await this.startWithPreferredPorts(organizationId, config);
					this.watchdogFailures.delete(organizationId);
				} catch (error) {
					log.error(
						`[host-service:${organizationId}] watchdog respawn retry failed:`,
						error,
					);
				}
			}
		} catch (error) {
			// The tick runs detached from a timer — a rejection here (e.g. the
			// config lookup throwing) would otherwise surface as an unhandled
			// rejection. Log and let the next tick retry.
			log.error("[host-service] watchdog tick failed:", error);
		} finally {
			this.watchdogTickInFlight = false;
		}
	}

	// ── Spawn ─────────────────────────────────────────────────────────

	private async spawn(
		organizationId: string,
		config: SpawnConfig,
		preferredPorts: Iterable<number> = this.getPreferredPorts(organizationId),
	): Promise<Connection> {
		const port = await findFreePort(preferredPorts);
		this.rememberPort(organizationId, port);
		const secret = randomBytes(32).toString("hex");

		const instance: HostServiceProcess = {
			pid: 0,
			port,
			secret,
			status: "starting",
			owned: true,
		};
		this.instances.set(organizationId, instance);
		this.emitStatus(organizationId, "starting", null);

		try {
			const childEnv = await this.buildEnv(
				organizationId,
				port,
				secret,
				config,
			);
			const logFd = openRotatingLogFd(
				path.join(manifestDir(organizationId), "host-service.log"),
				MAX_HOST_LOG_BYTES,
			);
			// Dev: pipe child stdout/stderr through this process so log lines
			// land in the developer's `bun dev` terminal. Production: hard-back
			// stdio with the rotating log file.
			const isDev = !app.isPackaged;
			const stdio: childProcess.StdioOptions = isDev
				? ["ignore", "pipe", "pipe"]
				: logFd >= 0
					? ["ignore", logFd, logFd]
					: ["ignore", "ignore", "ignore"];

			let child: ReturnType<typeof childProcess.spawn>;
			try {
				child = childProcess.spawn(process.execPath, [this.scriptPath], {
					detached: false,
					stdio,
					env: childEnv,
					// Avoid a flashing CMD window on Windows.
					windowsHide: true,
				});
			} finally {
				if (logFd >= 0) {
					try {
						fs.closeSync(logFd);
					} catch {
						// Best-effort — child has its own dup of the fd.
					}
				}
			}

			// In dev, fan child output through to parent stdout/stderr with a
			// prefix so it's identifiable in `bun dev`.
			if (isDev && child.stdout && child.stderr) {
				const tag = `[hs:${organizationId.slice(0, 8)}]`;
				pipeWithPrefix(child.stdout, process.stdout, tag);
				pipeWithPrefix(child.stderr, process.stderr, tag);
			}

			const childPid = child.pid;
			if (!childPid) {
				throw new Error("Failed to spawn host service process");
			}

			instance.pid = childPid;
			let childExited = false;
			child.on("exit", (code, signal) => {
				childExited = true;
				log.info(
					`[host-service:${organizationId}] exited with code ${code} signal ${signal}`,
				);
				const current = this.instances.get(organizationId);
				if (
					!current ||
					current.pid !== childPid ||
					current.status === "stopped"
				)
					return;

				// Only alert a crash of a running child; startup deaths surface via
				// start()'s rejection instead.
				const previousStatus = current.status;
				this.rememberPort(organizationId, current.port);
				this.instances.delete(organizationId);
				removeManifest(organizationId);
				this.emitStatus(organizationId, "stopped", previousStatus);

				if (previousStatus === "running") {
					this.alertChildCrashed(organizationId, code, signal);
				}
			});
			// Don't let the child block Electron's exit — stopAll() handles teardown.
			child.unref();

			const endpoint = `http://127.0.0.1:${port}`;
			const healthy = await pollHealthCheck(
				endpoint,
				secret,
				HEALTH_POLL_TIMEOUT_MS,
				() => childExited,
			);
			if (!healthy) {
				if (!childExited) child.kill("SIGTERM");
				throw new Error(
					childExited
						? "Host service process exited during startup"
						: `Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
				);
			}

			instance.status = "running";

			log.info(`[host-service:${organizationId}] listening on port ${port}`);
			this.emitStatus(organizationId, "running", "starting");
			return { port, secret, machineId: this.machineId };
		} catch (error) {
			// Every startup failure must remove the "starting" entry — a stale
			// ghost (e.g. buildEnv rejecting) would make status readers and the
			// watchdog's retry pass treat the org as occupied forever. The child
			// exit handler may have cleaned up already; only act if this call's
			// instance is still the registered one.
			if (this.instances.get(organizationId) === instance) {
				this.instances.delete(organizationId);
				this.emitStatus(organizationId, "stopped", "starting");
			}
			throw error;
		}
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
			DESKTOP_VITE_PORT: String(sharedEnv.DESKTOP_VITE_PORT),
			SUPERSET_HOME_DIR: SUPERSET_HOME_DIR,
			SUPERSET_LEGACY_WORKTREE_BASE_DIR: row?.worktreeBaseDir ?? "",
			SUPERSET_AGENT_HOOK_PORT: String(sharedEnv.DESKTOP_NOTIFICATIONS_PORT),
			SUPERSET_AGENT_HOOK_VERSION: HOOK_PROTOCOL_VERSION,
			AUTH_TOKEN: config.authToken,
			SUPERSET_AUTH_CONFIG_PATH: path.join(SUPERSET_HOME_DIR, "config.json"),
			SUPERSET_API_URL: config.cloudApiUrl,
			// Pre-release ACP session harness, internal-channel only: enabled on
			// canary and dev builds, never on stable. The host gates its router
			// and WS stream route on this env var.
			...(isInternalBuild() ? { SUPERSET_ACP_SESSIONS: "1" } : {}),
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
		const effectiveRelayUrl = await getRelayUrl();
		if (exposeViaRelay && effectiveRelayUrl) {
			childEnv.RELAY_URL = effectiveRelayUrl;
		} else {
			delete childEnv.RELAY_URL;
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
	 * Alert on an unexpected crash of a running child. Recovery is the existing
	 * tray > Host Service > Restart.
	 */
	private alertChildCrashed(
		organizationId: string,
		code: number | null,
		signal: NodeJS.Signals | null,
	): void {
		const cause =
			signal != null ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
		log.error(`[host-service:${organizationId}] crashed (${cause})`);
		dialog.showErrorBox(
			"Host service crashed",
			`The Superset host service stopped unexpectedly (${cause}). Workspaces and terminals for this organization are unavailable until it restarts — use the Superset tray menu > Host Service > Restart.`,
		);
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
