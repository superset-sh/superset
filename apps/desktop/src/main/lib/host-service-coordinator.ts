import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import path from "node:path";
import { settings } from "@superset/local-db";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { app } from "electron";
import log from "electron-log/main";
import { env as sharedEnv } from "shared/env.shared";
import { getProcessEnvWithShellPath } from "../../lib/trpc/routers/workspaces/utils/shell-env";
import { SUPERSET_HOME_DIR } from "./app-environment";
import {
	type HostServiceManifest,
	isProcessAlive,
	listManifests,
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
}

const ADOPTED_LIVENESS_INTERVAL = 5_000;

/**
 * Cap how long an adoption health check can take before we decide the adopted
 * process is dead and respawn. Short enough that a Cmd+R into a wedged
 * host-service heals quickly; long enough to ride out brief startup blips.
 */
const ADOPT_HEALTH_CHECK_TIMEOUT_MS = 2_000;

export class HostServiceCoordinator extends EventEmitter {
	private instances = new Map<string, HostServiceProcess>();
	private pendingStarts = new Map<string, Promise<Connection>>();
	private adoptedLivenessTimers = new Map<
		string,
		ReturnType<typeof setInterval>
	>();
	private scriptPath = path.join(__dirname, "host-service.js");
	private machineId = getHostId();
	private devReloadWatcher: fs.FSWatcher | null = null;
	// Note: pty-daemon supervision moved into host-service itself —
	// see packages/host-service/src/daemon. Host-service spawns and adopts
	// the daemon when it boots, so the desktop coordinator no longer needs
	// to know about it.

	async start(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
		const existing = this.instances.get(organizationId);
		if (existing?.status === "running") {
			return {
				port: existing.port,
				secret: existing.secret,
				machineId: this.machineId,
			};
		}

		const pending = this.pendingStarts.get(organizationId);
		if (pending) return pending;

		const startPromise = (async (): Promise<Connection> => {
			const adopted = await this.tryAdopt(organizationId);
			if (adopted) return adopted;
			return this.spawn(organizationId, config);
		})();
		this.pendingStarts.set(organizationId, startPromise);

		try {
			return await startPromise;
		} finally {
			this.pendingStarts.delete(organizationId);
		}
	}

	stop(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		this.stopAdoptedLivenessCheck(organizationId);

		if (!instance) return;

		const previousStatus = instance.status;
		instance.status = "stopped";

		try {
			process.kill(instance.pid, "SIGTERM");
		} catch {}

		this.instances.delete(organizationId);
		removeManifest(organizationId);
		this.emitStatus(organizationId, "stopped", previousStatus);
	}

	stopAll(): void {
		for (const [id] of this.instances) {
			this.stop(id);
		}
	}

	releaseAll(): void {
		for (const [id] of this.instances) {
			this.stopAdoptedLivenessCheck(id);
		}
		this.instances.clear();
	}

	async discoverAll(): Promise<void> {
		const manifests = listManifests();
		for (const manifest of manifests) {
			if (this.instances.has(manifest.organizationId)) continue;
			try {
				await this.tryAdopt(manifest.organizationId);
			} catch {
				removeManifest(manifest.organizationId);
			}
		}
	}

	async restart(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
		this.stop(organizationId);
		return this.start(organizationId, config);
	}

	/**
	 * Forcefully reset host-service state for an org. Unlike `restart`, this
	 * SIGKILLs whatever pid the manifest names — even when no instance is
	 * tracked in this process (e.g. a manifest left by a previous app session)
	 * — then removes the manifest so adoption can't pick up the stale entry,
	 * and respawns. Used by the recovery path for superset-sh/superset#4299
	 * where a live-but-wedged host-service keeps getting re-adopted.
	 */
	async reset(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
		// Capture the manifest pid *before* stop() — stop() removes the manifest
		// for tracked instances and only sends SIGTERM, which a wedged process
		// can ignore. We escalate to SIGKILL on whatever pid the manifest named.
		const manifestPid = readManifest(organizationId)?.pid;

		this.stop(organizationId);

		if (manifestPid != null && isProcessAlive(manifestPid)) {
			try {
				process.kill(manifestPid, "SIGKILL");
			} catch (error) {
				log.warn(
					`[host-service:${organizationId}] reset: SIGKILL of pid=${manifestPid} failed`,
					error,
				);
			}
		}

		removeManifest(organizationId);

		return this.start(organizationId, config);
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

	getProcessStatus(organizationId: string): HostServiceStatus {
		if (this.pendingStarts.has(organizationId)) return "starting";
		return this.instances.get(organizationId)?.status ?? "stopped";
	}

	hasActiveInstances(): boolean {
		for (const instance of this.instances.values()) {
			if (instance.status === "running" || instance.status === "starting")
				return true;
		}
		return this.pendingStarts.size > 0;
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

	// ── Adoption ──────────────────────────────────────────────────────

	private async tryAdopt(organizationId: string): Promise<Connection | null> {
		const manifest = this.readAndValidateManifest(organizationId);
		if (!manifest) return null;

		const url = new URL(manifest.endpoint);
		const port = Number(url.port);

		const currentAppVersion = app.getVersion();
		if (manifest.spawnedByAppVersion !== currentAppVersion) {
			const reason = manifest.spawnedByAppVersion
				? `spawned by app ${manifest.spawnedByAppVersion} != current ${currentAppVersion}`
				: "no recorded app version (pre-upgrade manifest)";
			log.info(
				`[host-service:${organizationId}] Adopted service ${reason}, killing`,
			);
			try {
				process.kill(manifest.pid, "SIGTERM");
			} catch {}
			removeManifest(organizationId);
			return null;
		}

		// A live pid is not the same as a serving host-service — the process can
		// be hung on migrations, deadlocked, or no longer bound to the recorded
		// port. Without this check the renderer's `getConnection` keeps handing
		// out a dead port forever, which is the failure mode in superset-sh/superset#4299.
		const healthy = await pollHealthCheck(
			manifest.endpoint,
			manifest.authToken,
			ADOPT_HEALTH_CHECK_TIMEOUT_MS,
		);
		if (!healthy) {
			log.info(
				`[host-service:${organizationId}] Adopted pid=${manifest.pid} did not respond on ${manifest.endpoint}, killing and respawning`,
			);
			try {
				process.kill(manifest.pid, "SIGKILL");
			} catch (error) {
				// ESRCH (already gone) is fine; anything else (EPERM) we want to see.
				if ((error as NodeJS.ErrnoException)?.code !== "ESRCH") {
					log.warn(
						`[host-service:${organizationId}] SIGKILL of stale pid=${manifest.pid} failed`,
						error,
					);
				}
			}
			removeManifest(organizationId);
			return null;
		}

		this.instances.set(organizationId, {
			pid: manifest.pid,
			port,
			secret: manifest.authToken,
			status: "running",
		});
		this.startAdoptedLivenessCheck(organizationId, manifest.pid);

		log.info(
			`[host-service:${organizationId}] Adopted pid=${manifest.pid} port=${port}`,
		);
		this.emitStatus(organizationId, "running", null);
		return { port, secret: manifest.authToken, machineId: this.machineId };
	}

	private readAndValidateManifest(
		organizationId: string,
	): HostServiceManifest | null {
		const manifest = readManifest(organizationId);
		if (!manifest) return null;

		if (!isProcessAlive(manifest.pid)) {
			removeManifest(organizationId);
			return null;
		}

		return manifest;
	}

	// ── Spawn ─────────────────────────────────────────────────────────

	private async spawn(
		organizationId: string,
		config: SpawnConfig,
	): Promise<Connection> {
		const port = await findFreePort();
		const secret = randomBytes(32).toString("hex");

		const instance: HostServiceProcess = {
			pid: 0,
			port,
			secret,
			status: "starting",
		};
		this.instances.set(organizationId, instance);
		this.emitStatus(organizationId, "starting", null);

		// pty-daemon is supervised by host-service itself; this coordinator
		// only spawns host-service and steps out. See
		// packages/host-service/src/daemon for the supervisor lifecycle.
		const childEnv = await this.buildEnv(organizationId, port, secret, config);
		// Host-service owns v2 PTYs, so it must survive Electron restarts in
		// every environment. This mirrors the terminal-host daemon: detach the
		// child and back stdio with real files so parent teardown cannot close
		// pipes and take the service down with the app.
		const logFd = openRotatingLogFd(
			path.join(manifestDir(organizationId), "host-service.log"),
			MAX_HOST_LOG_BYTES,
		);
		// Dev: pipe child stdout/stderr through this process so log lines
		// land in the developer's `bun dev` terminal. Production: hard-back
		// stdio with the rotating log file so the detached child survives
		// parent teardown without losing logs.
		const isDev = !app.isPackaged;
		const stdio: childProcess.StdioOptions = isDev
			? ["ignore", "pipe", "pipe"]
			: logFd >= 0
				? ["ignore", logFd, logFd]
				: ["ignore", "ignore", "ignore"];

		let child: ReturnType<typeof childProcess.spawn>;
		try {
			// Prod: detached so PTYs survive Electron restarts via manifest
			// adoption (docs/HOST_SERVICE_LIFECYCLE.md). Dev: attached so a `bun dev`
			// kill propagates and serve.ts's dev shutdown can stop pty-daemon.
			child = childProcess.spawn(process.execPath, [this.scriptPath], {
				detached: !isDev,
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
		// prefix so it's identifiable in `bun dev`. The detached child has
		// its own session, so closing pipes won't kill it on parent exit.
		if (isDev && child.stdout && child.stderr) {
			const tag = `[hs:${organizationId.slice(0, 8)}]`;
			pipeWithPrefix(child.stdout, process.stdout, tag);
			pipeWithPrefix(child.stderr, process.stderr, tag);
		}

		const childPid = child.pid;
		if (!childPid) {
			this.instances.delete(organizationId);
			throw new Error("Failed to spawn host service process");
		}

		instance.pid = childPid;
		child.on("exit", (code) => {
			log.info(`[host-service:${organizationId}] exited with code ${code}`);
			const current = this.instances.get(organizationId);
			if (!current || current.pid !== childPid || current.status === "stopped")
				return;

			this.instances.delete(organizationId);
			removeManifest(organizationId);
			this.emitStatus(organizationId, "stopped", "running");
		});
		if (!isDev) child.unref();

		const endpoint = `http://127.0.0.1:${port}`;
		const healthy = await pollHealthCheck(endpoint, secret);
		if (!healthy) {
			child.kill("SIGTERM");
			this.instances.delete(organizationId);
			throw new Error(
				`Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
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

		const childEnv = await getProcessEnvWithShellPath({
			...(process.env as Record<string, string>),
			ELECTRON_RUN_AS_NODE: "1",
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
			SUPERSET_AGENT_HOOK_PORT: String(sharedEnv.DESKTOP_NOTIFICATIONS_PORT),
			SUPERSET_AGENT_HOOK_VERSION: HOOK_PROTOCOL_VERSION,
			SUPERSET_APP_VERSION: app.getVersion(),
			AUTH_TOKEN: config.authToken,
			SUPERSET_API_URL: config.cloudApiUrl,
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

	// ── Liveness ──────────────────────────────────────────────────────

	private startAdoptedLivenessCheck(organizationId: string, pid: number): void {
		this.stopAdoptedLivenessCheck(organizationId);
		const timer = setInterval(() => {
			if (!isProcessAlive(pid)) {
				clearInterval(timer);
				this.adoptedLivenessTimers.delete(organizationId);
				const instance = this.instances.get(organizationId);
				if (instance && instance.status !== "stopped") {
					log.info(
						`[host-service:${organizationId}] Adopted process ${pid} died`,
					);
					this.instances.delete(organizationId);
					removeManifest(organizationId);
					this.emitStatus(organizationId, "stopped", "running");
				}
			}
		}, ADOPTED_LIVENESS_INTERVAL);
		this.adoptedLivenessTimers.set(organizationId, timer);
	}

	private stopAdoptedLivenessCheck(organizationId: string): void {
		const timer = this.adoptedLivenessTimers.get(organizationId);
		if (timer) {
			clearInterval(timer);
			this.adoptedLivenessTimers.delete(organizationId);
		}
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
