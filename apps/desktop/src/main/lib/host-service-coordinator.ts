import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import path from "node:path";
import { settings } from "@superset/local-db";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { app } from "electron";
import { env } from "main/env.main";
import semver from "semver";
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
import { HOOK_PROTOCOL_VERSION } from "./terminal/env";

/**
 * Minimum host-service version this app can work with. Bumping this forces
 * the coordinator to kill + respawn any adopted service older than this,
 * which is how we prevent the renderer from talking to a stale host-service
 * that's missing newly-added procedures/params.
 *
 * 0.4.0: terminal launch moved from `terminal.ensureSession` to
 * `terminal.launchSession` plus WebSocket attach params.
 * 0.3.0: host-service registers via cloud `host.ensure` (was
 * `device.ensureV2Host`); v2_hosts/v2_users_hosts/v2_workspaces use
 * machineId text instead of uuid surrogates.
 * 0.2.0: `workspaceCreation.adopt` gained optional `worktreePath`.
 */
const MIN_HOST_SERVICE_VERSION = "0.4.0";

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
							console.warn(
								"[host-service] bundle did not stabilize, skipping reload",
							);
							return;
						}
						const config = await configProvider();
						if (!config) return;
						console.log(
							"[host-service] bundle changed, restarting running instances",
						);
						await this.restartAll(config);
					} catch (error) {
						console.error("[host-service] dev reload failed:", error);
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
			console.error("[host-service] failed to enable dev reload:", error);
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

		const version = await this.fetchHostVersion(
			manifest.endpoint,
			manifest.authToken,
		);
		if (
			!version ||
			!semver.satisfies(version, `>=${MIN_HOST_SERVICE_VERSION}`)
		) {
			const reason = version
				? `version ${version} < ${MIN_HOST_SERVICE_VERSION}`
				: "version unknown";
			console.log(
				`[host-service:${organizationId}] Adopted service ${reason}, killing`,
			);
			try {
				process.kill(manifest.pid, "SIGTERM");
			} catch {}
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

		console.log(
			`[host-service:${organizationId}] Adopted pid=${manifest.pid} port=${port}`,
		);
		this.emitStatus(organizationId, "running", null);
		return { port, secret: manifest.authToken, machineId: this.machineId };
	}

	private async fetchHostVersion(
		endpoint: string,
		secret: string,
	): Promise<string | null> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 3_000);
			const response = await fetch(`${endpoint}/trpc/host.info`, {
				signal: controller.signal,
				headers: { Authorization: `Bearer ${secret}` },
			});
			clearTimeout(timeout);
			if (!response.ok) return null;
			const data = await response.json();
			const result = data?.result?.data;
			return result?.json?.version ?? result?.version ?? null;
		} catch {
			return null;
		}
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

		const childEnv = await this.buildEnv(organizationId, port, secret, config);
		// Host-service owns v2 PTYs, so it must survive Electron restarts in
		// every environment. This mirrors the terminal-host daemon: detach the
		// child and back stdio with real files so parent teardown cannot close
		// pipes and take the service down with the app.
		const logFd = openRotatingLogFd(
			path.join(manifestDir(organizationId), "host-service.log"),
			MAX_HOST_LOG_BYTES,
		);
		const stdio: childProcess.StdioOptions =
			logFd >= 0 ? ["ignore", logFd, logFd] : ["ignore", "ignore", "ignore"];

		let child: ReturnType<typeof childProcess.spawn>;
		try {
			child = childProcess.spawn(process.execPath, [this.scriptPath], {
				detached: true,
				stdio,
				env: childEnv,
				// Avoid a flashing CMD window on Windows for the detached child.
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

		const childPid = child.pid;
		if (!childPid) {
			this.instances.delete(organizationId);
			throw new Error("Failed to spawn host service process");
		}

		instance.pid = childPid;
		child.on("exit", (code) => {
			console.log(`[host-service:${organizationId}] exited with code ${code}`);
			const current = this.instances.get(organizationId);
			if (!current || current.pid !== childPid || current.status === "stopped")
				return;

			this.instances.delete(organizationId);
			removeManifest(organizationId);
			this.emitStatus(organizationId, "stopped", "running");
		});
		child.unref();

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

		console.log(`[host-service:${organizationId}] listening on port ${port}`);
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
			AUTH_TOKEN: config.authToken,
			SUPERSET_API_URL: config.cloudApiUrl,
		});

		// `getProcessEnvWithShellPath` merges in the user's interactive shell env,
		// which in dev has `RELAY_URL` set. Enforce the toggle *after* that merge
		// so the child definitely doesn't see a relay URL when disabled.
		if (exposeViaRelay && env.RELAY_URL) {
			childEnv.RELAY_URL = env.RELAY_URL;
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
					console.log(
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

let coordinator: HostServiceCoordinator | null = null;

export function getHostServiceCoordinator(): HostServiceCoordinator {
	if (!coordinator) {
		coordinator = new HostServiceCoordinator();
	}
	return coordinator;
}
