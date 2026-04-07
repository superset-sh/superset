import type { ChildProcess } from "node:child_process";
import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import { app } from "electron";
import { env as sharedEnv } from "shared/env.shared";
import { getProcessEnvWithShellPath } from "../../lib/trpc/routers/workspaces/utils/shell-env";
import { SUPERSET_HOME_DIR } from "./app-environment";
import { getDeviceName, getHashedDeviceId } from "./device-info";
import {
	HOST_SERVICE_PROTOCOL_VERSION,
	type HostServiceManifest,
	isProcessAlive,
	listManifests,
	manifestDir,
	readManifest,
	removeManifest,
} from "./host-service-manifest";
import { HOOK_PROTOCOL_VERSION } from "./terminal/env";

export type HostServiceStatus =
	| "starting"
	| "running"
	| "degraded"
	| "restarting"
	| "stopped";

export type CompatibilityResult =
	| { compatible: true; updateAvailable: boolean }
	| { compatible: false; reason: string };

export interface HostServiceInfo {
	organizationId: string;
	organizationName: string | null;
	status: HostServiceStatus;
	port: number | null;
	serviceVersion: string | null;
	protocolVersion: number | null;
	startedAt: number | null;
	uptime: number | null;
	restartCount: number;
	pendingRestart: boolean;
	compatibility: CompatibilityResult | null;
	adopted: boolean;
}

export interface HostServiceStatusEvent {
	organizationId: string;
	status: HostServiceStatus;
	previousStatus: HostServiceStatus | null;
}

interface HostServiceProcess {
	/** null when the instance was adopted from a manifest (no child handle). */
	process: ChildProcess | null;
	port: number | null;
	secret: string | null;
	status: HostServiceStatus;
	restartCount: number;
	lastCrash?: number;
	organizationId: string;
	startedAt: number | null;
	serviceVersion: string | null;
	protocolVersion: number | null;
	pendingRestart: boolean;
	/** True when this instance was adopted from a running manifest rather than spawned. */
	adopted: boolean;
	/** PID of the adopted process (for liveness checks). */
	adoptedPid: number | null;
}

interface PendingStart {
	promise: Promise<number>;
	resolve: (port: number) => void;
	reject: (error: Error) => void;
	startupTimeout?: ReturnType<typeof setTimeout>;
	onMessage?: (message: unknown) => void;
}

const MAX_RESTART_DELAY = 30_000;
const BASE_RESTART_DELAY = 1_000;

/** Interval for checking liveness of adopted (non-child) processes. */
const ADOPTED_LIVENESS_INTERVAL = 5_000;

function createPortDeferred(): {
	promise: Promise<number>;
	resolve: (port: number) => void;
	reject: (error: Error) => void;
} {
	let resolve!: (port: number) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<number>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

/** Check whether a host-service instance is compatible with this app version. */
export function checkCompatibility(instance: {
	protocolVersion: number | null;
	serviceVersion: string | null;
}): CompatibilityResult | null {
	if (instance.protocolVersion === null) return null;

	if (instance.protocolVersion !== HOST_SERVICE_PROTOCOL_VERSION) {
		return {
			compatible: false,
			reason: `Protocol mismatch: service=${instance.protocolVersion}, app=${HOST_SERVICE_PROTOCOL_VERSION}`,
		};
	}

	const currentVersion = app.getVersion();
	const updateAvailable =
		instance.serviceVersion !== null &&
		instance.serviceVersion !== currentVersion;

	return { compatible: true, updateAvailable };
}

async function buildHostServiceEnv(
	organizationId: string,
	secret: string,
): Promise<Record<string, string>> {
	const orgDir = manifestDir(organizationId);

	return getProcessEnvWithShellPath({
		...(process.env as Record<string, string>),
		// Host-service runtime keys
		ELECTRON_RUN_AS_NODE: "1",
		ORGANIZATION_ID: organizationId,
		DEVICE_CLIENT_ID: getHashedDeviceId(),
		DEVICE_NAME: getDeviceName(),
		HOST_SERVICE_SECRET: secret,
		HOST_SERVICE_VERSION: app.getVersion(),
		HOST_MANIFEST_DIR: orgDir,
		KEEP_ALIVE_AFTER_PARENT: "1",
		HOST_DB_PATH: path.join(orgDir, "host.db"),
		HOST_MIGRATIONS_PATH: app.isPackaged
			? path.join(process.resourcesPath, "resources/host-migrations")
			: path.join(app.getAppPath(), "../../packages/host-service/drizzle"),
		DESKTOP_VITE_PORT: String(sharedEnv.DESKTOP_VITE_PORT),
		SUPERSET_HOME_DIR: SUPERSET_HOME_DIR,
		SUPERSET_AGENT_HOOK_PORT: String(sharedEnv.DESKTOP_NOTIFICATIONS_PORT),
		SUPERSET_AGENT_HOOK_VERSION: HOOK_PROTOCOL_VERSION,
	});
}

export class HostServiceManager extends EventEmitter {
	private instances = new Map<string, HostServiceProcess>();
	private pendingStarts = new Map<string, PendingStart>();
	private scheduledRestarts = new Map<string, ReturnType<typeof setTimeout>>();
	private adoptedLivenessTimers = new Map<
		string,
		ReturnType<typeof setInterval>
	>();
	private organizationNames = new Map<string, string>();
	private scriptPath = path.join(__dirname, "host-service.js");
	private authToken: string | null = null;
	private cloudApiUrl: string | null = null;

	setAuthToken(token: string | null): void {
		this.authToken = token;
	}

	setCloudApiUrl(url: string | null): void {
		this.cloudApiUrl = url;
	}

	setOrganizationName(organizationId: string, name: string): void {
		this.organizationNames.set(organizationId, name);
	}

	getOrganizationName(organizationId: string): string | null {
		return this.organizationNames.get(organizationId) ?? null;
	}

	async start(organizationId: string): Promise<number> {
		const existing = this.instances.get(organizationId);
		if (existing?.status === "running" && existing.port !== null) {
			return existing.port;
		}
		const existingPending = this.pendingStarts.get(organizationId);
		if (existingPending) {
			return existingPending.promise;
		}

		this.cancelScheduledRestart(organizationId);

		// Register a pending start BEFORE the async tryAdopt so that concurrent
		// callers see it and dedupe instead of racing through adoption + spawn.
		const deferred = createPortDeferred();
		this.pendingStarts.set(organizationId, deferred);

		const adopted = await this.tryAdopt(organizationId);
		if (adopted !== null) {
			if (this.pendingStarts.get(organizationId) === deferred) {
				this.pendingStarts.delete(organizationId);
			}
			deferred.resolve(adopted);
			return adopted;
		}

		// Adoption failed — spawn() will reuse the deferred already in pendingStarts.
		return this.spawn(organizationId);
	}

	stop(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		this.cancelScheduledRestart(organizationId);
		this.cancelPendingStart(organizationId, new Error("Host service stopped"));
		this.stopAdoptedLivenessCheck(organizationId);

		if (!instance) return;

		const previousStatus = instance.status;
		instance.status = "stopped";
		if (instance.adopted && instance.adoptedPid) {
			try {
				process.kill(instance.adoptedPid, "SIGTERM");
			} catch {
				// Already dead
			}
		} else {
			instance.process?.kill("SIGTERM");
		}
		this.instances.delete(organizationId);
		removeManifest(organizationId);
		this.emitStatus(organizationId, "stopped", previousStatus);
	}

	stopAll(): void {
		for (const [id] of this.instances) {
			this.stop(id);
		}
	}

	/** Release all instances without killing the underlying processes.
	 *  The services keep running and can be re-adopted on next app start. */
	releaseAll(): void {
		for (const [id] of this.instances) {
			this.release(id);
		}
	}

	/** Scan for on-disk manifests and adopt any running services.
	 *  Call during startup so the tray shows accurate state immediately. */
	async discoverAndAdoptAll(): Promise<void> {
		const manifests = listManifests();
		for (const manifest of manifests) {
			if (this.instances.has(manifest.organizationId)) continue;
			try {
				await this.tryAdopt(manifest.organizationId);
			} catch (error) {
				console.error(
					`[host-service:${manifest.organizationId}] Failed to adopt, removing bad manifest:`,
					error,
				);
				removeManifest(manifest.organizationId);
			}
		}
	}

	async restart(organizationId: string): Promise<number> {
		const instance = this.instances.get(organizationId);
		if (instance) {
			const previousStatus = instance.status;
			instance.status = "restarting";
			this.emitStatus(organizationId, "restarting", previousStatus);

			this.cancelScheduledRestart(organizationId);
			this.cancelPendingStart(
				organizationId,
				new Error("Host service restarting"),
			);
			this.stopAdoptedLivenessCheck(organizationId);

			if (instance.adopted && instance.adoptedPid) {
				try {
					process.kill(instance.adoptedPid, "SIGTERM");
				} catch {
					// Already dead
				}
			} else {
				instance.process?.kill("SIGTERM");
			}
			this.instances.delete(organizationId);
			removeManifest(organizationId);
		}

		return this.spawn(organizationId);
	}

	getPort(organizationId: string): number | null {
		return this.instances.get(organizationId)?.port ?? null;
	}

	getSecret(organizationId: string): string | null {
		return this.instances.get(organizationId)?.secret ?? null;
	}

	getStatus(organizationId: string): HostServiceStatus {
		if (this.pendingStarts.has(organizationId)) {
			return "starting";
		}
		return this.instances.get(organizationId)?.status ?? "stopped";
	}

	getServiceInfo(organizationId: string): HostServiceInfo {
		const organizationName = this.getOrganizationName(organizationId);
		const instance = this.instances.get(organizationId);
		if (!instance) {
			return {
				organizationId,
				organizationName,
				status: this.pendingStarts.has(organizationId) ? "starting" : "stopped",
				port: null,
				serviceVersion: null,
				protocolVersion: null,
				startedAt: null,
				uptime: null,
				restartCount: 0,
				pendingRestart: false,
				compatibility: null,
				adopted: false,
			};
		}

		return {
			organizationId,
			organizationName,
			status: instance.status,
			port: instance.port,
			serviceVersion: instance.serviceVersion,
			protocolVersion: instance.protocolVersion,
			startedAt: instance.startedAt,
			uptime: instance.startedAt
				? Math.floor((Date.now() - instance.startedAt) / 1000)
				: null,
			restartCount: instance.restartCount,
			pendingRestart: instance.pendingRestart,
			compatibility: checkCompatibility(instance),
			adopted: instance.adopted,
		};
	}

	hasActiveInstances(): boolean {
		for (const instance of this.instances.values()) {
			if (instance.status === "running" || instance.status === "starting") {
				return true;
			}
		}
		return this.pendingStarts.size > 0;
	}

	getActiveOrganizationIds(): string[] {
		const ids: string[] = [];
		for (const [id, instance] of this.instances) {
			if (instance.status !== "stopped") {
				ids.push(id);
			}
		}
		return ids;
	}

	/** Mark a host-service instance for restart when it becomes idle. */
	markPendingRestart(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		if (!instance) return;
		instance.pendingRestart = true;
		this.emitStatus(organizationId, instance.status, instance.status);
	}

	/** Check all instances for compatibility and mark incompatible ones for restart. */
	checkAllCompatibility(): void {
		for (const [orgId, instance] of this.instances) {
			if (instance.status !== "running") continue;
			const result = checkCompatibility(instance);
			if (result && !result.compatible) {
				console.log(`[host-service:${orgId}] Incompatible: ${result.reason}`);
				instance.pendingRestart = true;
				this.emitStatus(orgId, instance.status, instance.status);
			}
		}
	}

	// ── Discovery / Adoption ──────────────────────────────────────────

	/** Try to adopt an already-running host-service from its on-disk manifest. */
	private async tryAdopt(organizationId: string): Promise<number | null> {
		const manifest = readManifest(organizationId);
		if (!manifest) return null;

		if (!isProcessAlive(manifest.pid)) {
			console.log(
				`[host-service:${organizationId}] Manifest process ${manifest.pid} is dead, removing stale manifest`,
			);
			removeManifest(organizationId);
			return null;
		}

		const healthy = await this.healthCheck(manifest);
		if (!healthy) {
			console.log(
				`[host-service:${organizationId}] Manifest endpoint ${manifest.endpoint} not reachable, removing stale manifest`,
			);
			removeManifest(organizationId);
			return null;
		}

		const compat = checkCompatibility({
			protocolVersion: manifest.protocolVersion,
			serviceVersion: manifest.serviceVersion,
		});

		if (compat && !compat.compatible) {
			console.log(
				`[host-service:${organizationId}] Manifest service incompatible: ${compat.reason}. Will kill and respawn.`,
			);
			try {
				process.kill(manifest.pid, "SIGTERM");
			} catch {
				// Already dead
			}
			removeManifest(organizationId);
			return null;
		}

		const url = new URL(manifest.endpoint);
		const port = Number(url.port);
		const pendingRestart =
			compat !== null && "updateAvailable" in compat && compat.updateAvailable;

		const instance: HostServiceProcess = {
			process: null,
			port,
			secret: manifest.authToken,
			status: "running",
			restartCount: 0,
			organizationId,
			startedAt: manifest.startedAt,
			serviceVersion: manifest.serviceVersion,
			protocolVersion: manifest.protocolVersion,
			pendingRestart,
			adopted: true,
			adoptedPid: manifest.pid,
		};
		this.instances.set(organizationId, instance);
		this.startAdoptedLivenessCheck(organizationId, manifest.pid);

		console.log(
			`[host-service:${organizationId}] Adopted existing service pid=${manifest.pid} port=${port} v${manifest.serviceVersion}`,
		);
		this.emitStatus(organizationId, "running", null);
		return port;
	}

	private async healthCheck(manifest: HostServiceManifest): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 3_000);
			const res = await fetch(`${manifest.endpoint}/trpc/health.check`, {
				signal: controller.signal,
				headers: {
					Authorization: `Bearer ${manifest.authToken}`,
				},
			});
			clearTimeout(timeout);
			return res.ok;
		} catch {
			return false;
		}
	}

	private startAdoptedLivenessCheck(organizationId: string, pid: number): void {
		this.stopAdoptedLivenessCheck(organizationId);

		const timer = setInterval(() => {
			if (!isProcessAlive(pid)) {
				console.log(
					`[host-service:${organizationId}] Adopted process ${pid} died`,
				);
				this.stopAdoptedLivenessCheck(organizationId);

				const current = this.instances.get(organizationId);
				if (current?.adopted && current.status !== "stopped") {
					current.status = "degraded";
					current.lastCrash = Date.now();
					this.emitStatus(organizationId, "degraded", "running");
					this.scheduleRestart(organizationId);
				}
			}
		}, ADOPTED_LIVENESS_INTERVAL);
		timer.unref();
		this.adoptedLivenessTimers.set(organizationId, timer);
	}

	private stopAdoptedLivenessCheck(organizationId: string): void {
		const timer = this.adoptedLivenessTimers.get(organizationId);
		if (timer) {
			clearInterval(timer);
			this.adoptedLivenessTimers.delete(organizationId);
		}
	}

	/** Release an instance without killing it. Allows the process to keep running. */
	private release(organizationId: string): void {
		this.cancelScheduledRestart(organizationId);
		this.cancelPendingStart(organizationId, new Error("Host service released"));
		this.stopAdoptedLivenessCheck(organizationId);

		const instance = this.instances.get(organizationId);
		if (!instance) return;

		if (instance.process) {
			instance.process.disconnect?.();
			instance.process.unref?.();
			instance.process = null;
		}
		this.instances.delete(organizationId);
		// Leave the manifest on disk — next app start will adopt it.
	}

	// ── Spawn ─────────────────────────────────────────────────────────

	private async spawn(organizationId: string): Promise<number> {
		// Reuse a pending start registered by start(), or create a fresh one
		// (e.g. when called directly from restart/scheduleRestart).
		const pendingStart =
			this.pendingStarts.get(organizationId) ?? createPortDeferred();
		const secret = randomBytes(32).toString("hex");

		const previousInstance = this.instances.get(organizationId);
		const restartCount = previousInstance?.restartCount ?? 0;

		const instance: HostServiceProcess = {
			process: null,
			port: null,
			secret,
			status: "starting",
			restartCount,
			organizationId,
			startedAt: null,
			serviceVersion: null,
			protocolVersion: null,
			pendingRestart: false,
			adopted: false,
			adoptedPid: null,
		};
		this.instances.set(organizationId, instance);
		this.pendingStarts.set(organizationId, pendingStart);
		this.emitStatus(organizationId, "starting", null);

		try {
			const env = await buildHostServiceEnv(organizationId, secret);
			if (this.authToken) {
				env.AUTH_TOKEN = this.authToken;
			}
			if (this.cloudApiUrl) {
				env.CLOUD_API_URL = this.cloudApiUrl;
			}

			if (
				this.instances.get(organizationId) !== instance ||
				this.pendingStarts.get(organizationId) !== pendingStart
			) {
				throw new Error("Host service start cancelled");
			}

			const child = childProcess.spawn(process.execPath, [this.scriptPath], {
				stdio: ["ignore", "pipe", "pipe", "ipc"],
				env,
			});
			instance.process = child;

			this.attachProcessHandlers(instance, child);
			this.attachStartupReadyListener(instance, pendingStart);
			return pendingStart.promise;
		} catch (error) {
			if (
				this.instances.get(organizationId) === instance &&
				instance.port === null
			) {
				this.instances.delete(organizationId);
			}
			this.clearPendingStart(organizationId, pendingStart);
			pendingStart.reject(
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	private attachProcessHandlers(
		instance: HostServiceProcess,
		child: ChildProcess,
	): void {
		const { organizationId } = instance;

		child.stdout?.on("data", (data: Buffer) => {
			console.log(`[host-service:${organizationId}] ${data.toString().trim()}`);
		});

		child.stderr?.on("data", (data: Buffer) => {
			console.error(
				`[host-service:${organizationId}] ${data.toString().trim()}`,
			);
		});

		child.on("exit", (code) => {
			console.log(`[host-service:${organizationId}] exited with code ${code}`);
			const current = this.instances.get(organizationId);
			if (
				!current ||
				current.process !== child ||
				current.status === "stopped"
			) {
				return;
			}

			if (current.port === null) {
				this.cancelPendingStart(
					organizationId,
					new Error("Host service exited before reporting port"),
				);
			}

			const previousStatus = current.status;
			// If we were restarting, a new spawn is already in flight — don't
			// schedule another restart or overwrite the status.
			if (previousStatus === "restarting") {
				return;
			}

			current.status = "degraded";
			current.lastCrash = Date.now();
			this.emitStatus(organizationId, "degraded", previousStatus);
			this.scheduleRestart(organizationId);
		});
	}

	private failStartup(
		instance: HostServiceProcess,
		pendingStart: PendingStart,
		error: Error,
	): void {
		this.clearPendingStart(instance.organizationId, pendingStart);
		const previousStatus = instance.status;
		instance.status = "degraded";
		pendingStart.reject(error);
		const child = instance.process;
		instance.process = null;
		child?.kill("SIGTERM");
		instance.lastCrash = Date.now();
		this.emitStatus(instance.organizationId, "degraded", previousStatus);
		this.scheduleRestart(instance.organizationId);
	}

	private attachStartupReadyListener(
		instance: HostServiceProcess,
		pendingStart: PendingStart,
	): void {
		const onMessage = (message: unknown) => {
			if (
				typeof message !== "object" ||
				message === null ||
				!("type" in message) ||
				!("port" in message) ||
				message.type !== "ready" ||
				typeof message.port !== "number"
			) {
				return;
			}

			this.clearPendingStart(instance.organizationId, pendingStart);
			instance.port = message.port;
			instance.status = "running";
			instance.startedAt = Date.now();
			instance.restartCount = 0;

			if (
				"serviceVersion" in message &&
				typeof message.serviceVersion === "string"
			) {
				instance.serviceVersion = message.serviceVersion;
			}
			if (
				"protocolVersion" in message &&
				typeof message.protocolVersion === "number"
			) {
				instance.protocolVersion = message.protocolVersion;
			}

			console.log(
				`[host-service:${instance.organizationId}] listening on port ${message.port} (v${instance.serviceVersion}, protocol=${instance.protocolVersion})`,
			);

			const compat = checkCompatibility(instance);
			if (compat && !compat.compatible) {
				console.warn(
					`[host-service:${instance.organizationId}] ${compat.reason} — marking for restart`,
				);
				instance.pendingRestart = true;
			}

			this.emitStatus(instance.organizationId, "running", "starting");
			pendingStart.resolve(message.port);
		};

		pendingStart.onMessage = onMessage;
		instance.process?.on("message", onMessage);
		pendingStart.startupTimeout = setTimeout(() => {
			this.failStartup(
				instance,
				pendingStart,
				new Error("Timeout waiting for host-service port"),
			);
		}, 10_000);
	}

	private cancelPendingStart(organizationId: string, error: Error): void {
		const pendingStart = this.pendingStarts.get(organizationId);
		if (!pendingStart) return;

		this.clearPendingStart(organizationId, pendingStart);
		pendingStart.reject(error);
	}

	private clearPendingStart(
		organizationId: string,
		pendingStart: PendingStart,
	): void {
		const instance = this.instances.get(organizationId);

		if (pendingStart.onMessage) {
			instance?.process?.off("message", pendingStart.onMessage);
			pendingStart.onMessage = undefined;
		}
		if (pendingStart.startupTimeout) {
			clearTimeout(pendingStart.startupTimeout);
			pendingStart.startupTimeout = undefined;
		}
		if (this.pendingStarts.get(organizationId) === pendingStart) {
			this.pendingStarts.delete(organizationId);
		}
	}

	private cancelScheduledRestart(organizationId: string): void {
		const timer = this.scheduledRestarts.get(organizationId);
		if (timer) {
			clearTimeout(timer);
			this.scheduledRestarts.delete(organizationId);
		}
	}

	private scheduleRestart(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		if (!instance) return;

		this.cancelScheduledRestart(organizationId);

		const delay = Math.min(
			BASE_RESTART_DELAY * 2 ** instance.restartCount,
			MAX_RESTART_DELAY,
		);
		instance.restartCount++;

		console.log(
			`[host-service:${organizationId}] restarting in ${delay}ms (attempt ${instance.restartCount})`,
		);

		const timer = setTimeout(() => {
			this.scheduledRestarts.delete(organizationId);
			const current = this.instances.get(organizationId);
			if (current?.status === "degraded") {
				// Don't delete the instance — spawn() reads restartCount from it
				this.spawn(organizationId).catch((err) => {
					console.error(
						`[host-service:${organizationId}] restart failed:`,
						err,
					);
				});
			}
		}, delay);
		this.scheduledRestarts.set(organizationId, timer);
	}

	private emitStatus(
		organizationId: string,
		status: HostServiceStatus,
		previousStatus: HostServiceStatus | null,
	): void {
		const event: HostServiceStatusEvent = {
			organizationId,
			status,
			previousStatus,
		};
		this.emit("status-changed", event);
	}
}

let manager: HostServiceManager | null = null;

export function getHostServiceManager(): HostServiceManager {
	if (!manager) {
		manager = new HostServiceManager();
	}
	return manager;
}
