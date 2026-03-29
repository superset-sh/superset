import type { ChildProcess } from "node:child_process";
import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { getProcessEnvWithShellPath } from "../../lib/trpc/routers/workspaces/utils/shell-env";
import { SUPERSET_HOME_DIR } from "./app-environment";
import { getDeviceName, getHashedDeviceId } from "./device-info";

type HostServiceStatus = "starting" | "running" | "crashed";

interface HostServiceProcess {
	process: ChildProcess | null;
	port: number | null;
	secret: string | null;
	status: HostServiceStatus;
	restartCount: number;
	lastCrash?: number;
	organizationId: string;
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

export class HostServiceManager {
	private instances = new Map<string, HostServiceProcess>();
	private pendingStarts = new Map<string, PendingStart>();
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

		return this.spawn(organizationId);
	}

	stop(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		if (!instance) return;

		instance.status = "crashed"; // prevent restart
		this.cancelPendingStart(organizationId, new Error("Host service stopped"));
		instance.process?.kill("SIGTERM");
		this.instances.delete(organizationId);
	}

	stopAll(): void {
		for (const [id] of this.instances) {
			this.stop(id);
		}
	}

	getPort(organizationId: string): number | null {
		return this.instances.get(organizationId)?.port ?? null;
	}

	getSecret(organizationId: string): string | null {
		return this.instances.get(organizationId)?.secret ?? null;
	}

	getStatus(organizationId: string): HostServiceStatus | null {
		if (this.pendingStarts.has(organizationId)) {
			return "starting";
		}
		return this.instances.get(organizationId)?.status ?? null;
	}

	private async spawn(organizationId: string): Promise<number> {
		const pendingStart = createPortDeferred();
		const secret = randomBytes(32).toString("hex");
		const instance: HostServiceProcess = {
			process: null,
			port: null,
			secret,
			status: "starting",
			restartCount: 0,
			organizationId,
		};
		this.instances.set(organizationId, instance);
		this.pendingStarts.set(organizationId, pendingStart);

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
				current.status === "crashed"
			) {
				return;
			}

			if (current.port === null) {
				this.cancelPendingStart(
					organizationId,
					new Error("Host service exited before reporting port"),
				);
			}
			current.status = "crashed";
			current.lastCrash = Date.now();
			this.scheduleRestart(organizationId);
		});
	}

	private failStartup(
		instance: HostServiceProcess,
		pendingStart: PendingStart,
		error: Error,
	): void {
		this.clearPendingStart(instance.organizationId, pendingStart);
		instance.status = "crashed";
		pendingStart.reject(error);
		instance.process?.kill("SIGTERM");
		instance.lastCrash = Date.now();
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
			console.log(
				`[host-service:${instance.organizationId}] listening on port ${message.port}`,
			);
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

	private scheduleRestart(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		if (!instance) return;

		const delay = Math.min(
			BASE_RESTART_DELAY * 2 ** instance.restartCount,
			MAX_RESTART_DELAY,
		);
		instance.restartCount++;

		console.log(
			`[host-service:${organizationId}] restarting in ${delay}ms (attempt ${instance.restartCount})`,
		);

		setTimeout(() => {
			const current = this.instances.get(organizationId);
			if (current?.status === "crashed") {
				this.instances.delete(organizationId);
				this.spawn(organizationId).catch((err) => {
					console.error(
						`[host-service:${organizationId}] restart failed:`,
						err,
					);
				});
			}
		}, delay);
	}
}

let manager: HostServiceManager | null = null;

export function getHostServiceManager(): HostServiceManager {
	if (!manager) {
		manager = new HostServiceManager();
	}
	return manager;
}
