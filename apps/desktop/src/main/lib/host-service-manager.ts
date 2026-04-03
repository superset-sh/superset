import type { ChildProcess } from "node:child_process";
import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import { app } from "electron";
import { getProcessEnvWithShellPath } from "../../lib/trpc/routers/workspaces/utils/shell-env";
import { SUPERSET_HOME_DIR } from "./app-environment";
import { getDeviceName, getHashedDeviceId } from "./device-info";

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
	status: HostServiceStatus;
	port: number | null;
	serviceVersion: string | null;
	protocolVersion: number | null;
	startedAt: number | null;
	uptime: number | null;
	restartCount: number;
	pendingRestart: boolean;
	compatibility: CompatibilityResult | null;
}

export interface HostServiceStatusEvent {
	organizationId: string;
	status: HostServiceStatus;
	previousStatus: HostServiceStatus | null;
}

interface HostServiceProcess {
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

/** Protocol version for the IPC contract between ElectronMain and HostService.
 *  Bump this whenever the ready message shape, env contract, or health API
 *  changes in a backwards-incompatible way. */
export const HOST_SERVICE_PROTOCOL_VERSION = 1;

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

export class HostServiceManager extends EventEmitter {
	private instances = new Map<string, HostServiceProcess>();
	private pendingStarts = new Map<string, PendingStart>();
	private scheduledRestarts = new Map<string, ReturnType<typeof setTimeout>>();
	private scriptPath = path.join(__dirname, "host-service.js");
	private authToken: string | null = null;
	private cloudApiUrl: string | null = null;

	setAuthToken(token: string | null): void {
		this.authToken = token;
	}

	setCloudApiUrl(url: string | null): void {
		this.cloudApiUrl = url;
	}

	async start(organizationId: string): Promise<number> {
		const existing = this.instances.get(organizationId);
		if (existing?.status === "running" && existing.port !== null) {
			return existing.port;
		}
		const pendingStart = this.pendingStarts.get(organizationId);
		if (pendingStart) {
			return pendingStart.promise;
		}

		// Cancel any scheduled restart since we're starting explicitly
		this.cancelScheduledRestart(organizationId);

		return this.spawn(organizationId);
	}

	stop(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		this.cancelScheduledRestart(organizationId);
		this.cancelPendingStart(organizationId, new Error("Host service stopped"));

		if (!instance) return;

		const previousStatus = instance.status;
		instance.status = "stopped";
		instance.process?.kill("SIGTERM");
		this.instances.delete(organizationId);
		this.emitStatus(organizationId, "stopped", previousStatus);
	}

	stopAll(): void {
		for (const [id] of this.instances) {
			this.stop(id);
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
			instance.process?.kill("SIGTERM");
			this.instances.delete(organizationId);
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
		const instance = this.instances.get(organizationId);
		if (!instance) {
			return {
				organizationId,
				status: this.pendingStarts.has(organizationId) ? "starting" : "stopped",
				port: null,
				serviceVersion: null,
				protocolVersion: null,
				startedAt: null,
				uptime: null,
				restartCount: 0,
				pendingRestart: false,
				compatibility: null,
			};
		}

		return {
			organizationId,
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
			compatibility: this.checkCompatibility(instance),
		};
	}

	/** Returns true if any instance is in running or starting state */
	hasActiveInstances(): boolean {
		for (const instance of this.instances.values()) {
			if (instance.status === "running" || instance.status === "starting") {
				return true;
			}
		}
		return this.pendingStarts.size > 0;
	}

	/** Returns all organization IDs with active host-service instances */
	getActiveOrganizationIds(): string[] {
		const ids: string[] = [];
		for (const [id, instance] of this.instances) {
			if (instance.status !== "stopped") {
				ids.push(id);
			}
		}
		return ids;
	}

	/** Check whether a running host-service is compatible with this app version.
	 *  - protocol match + same version = compatible, no update
	 *  - protocol match + older service = compatible, update available
	 *  - protocol mismatch = incompatible, restart required */
	checkCompatibility(
		instance: Pick<HostServiceProcess, "protocolVersion" | "serviceVersion">,
	): CompatibilityResult | null {
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
			const result = this.checkCompatibility(instance);
			if (result && !result.compatible) {
				console.log(`[host-service:${orgId}] Incompatible: ${result.reason}`);
				instance.pendingRestart = true;
				this.emitStatus(orgId, instance.status, instance.status);
			}
		}
	}

	private async spawn(organizationId: string): Promise<number> {
		const pendingStart = createPortDeferred();
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
		};
		this.instances.set(organizationId, instance);
		this.pendingStarts.set(organizationId, pendingStart);
		this.emitStatus(organizationId, "starting", null);

		try {
			const env = await this.buildHostServiceEnv(organizationId, secret);
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

	private async buildHostServiceEnv(
		organizationId: string,
		secret: string,
	): Promise<Record<string, string>> {
		return getProcessEnvWithShellPath({
			...(process.env as Record<string, string>),
			ELECTRON_RUN_AS_NODE: "1",
			ORGANIZATION_ID: organizationId,
			DEVICE_CLIENT_ID: getHashedDeviceId(),
			DEVICE_NAME: getDeviceName(),
			HOST_SERVICE_SECRET: secret,
			HOST_SERVICE_VERSION: app.getVersion(),
			HOST_SERVICE_PROTOCOL_VERSION: String(HOST_SERVICE_PROTOCOL_VERSION),
			HOST_DB_PATH: path.join(
				SUPERSET_HOME_DIR,
				"host",
				organizationId,
				"host.db",
			),
			HOST_MIGRATIONS_PATH: app.isPackaged
				? path.join(process.resourcesPath, "resources/host-migrations")
				: path.join(app.getAppPath(), "../../packages/host-service/drizzle"),
		});
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
		instance.process?.kill("SIGTERM");
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

			// Pick up version info from the ready message if available
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

			// Check compatibility on connect
			const compat = this.checkCompatibility(instance);
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
				this.instances.delete(organizationId);
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
