import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { settings } from "@superset/local-db";
import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { app } from "electron";
import { env } from "main/env.main";
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
import { localDb } from "./local-db";
import { HOOK_PROTOCOL_VERSION } from "./terminal/env";

/** Minimum host-service version this app can work with. */
const MIN_HOST_SERVICE_VERSION = "0.1.0";

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

const HEALTH_POLL_INTERVAL = 200;
const HEALTH_POLL_TIMEOUT = 10_000;
const ADOPTED_LIVENESS_INTERVAL = 5_000;

async function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (addr && typeof addr === "object") {
				const { port } = addr;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error("Could not get port")));
			}
		});
		server.on("error", reject);
	});
}

async function pollHealthCheck(
	endpoint: string,
	secret: string,
	timeoutMs = HEALTH_POLL_TIMEOUT,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 2_000);
			const res = await fetch(`${endpoint}/trpc/health.check`, {
				signal: controller.signal,
				headers: { Authorization: `Bearer ${secret}` },
			});
			clearTimeout(timeout);
			if (res.ok) return true;
		} catch {
			// Not ready yet
		}
		await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL));
	}
	return false;
}

export class HostServiceCoordinator extends EventEmitter {
	private instances = new Map<string, HostServiceProcess>();
	private pendingStarts = new Map<string, Promise<Connection>>();
	private adoptedLivenessTimers = new Map<
		string,
		ReturnType<typeof setInterval>
	>();
	private scriptPath = path.join(__dirname, "host-service.js");
	private machineId = getHashedDeviceId();

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
		if (version && version < MIN_HOST_SERVICE_VERSION) {
			console.log(
				`[host-service:${organizationId}] Adopted service version ${version} < ${MIN_HOST_SERVICE_VERSION}, killing`,
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
			return data?.result?.data?.version ?? null;
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

		const env = await this.buildEnv(organizationId, port, secret, config);
		const child = childProcess.spawn(process.execPath, [this.scriptPath], {
			stdio: ["ignore", "pipe", "pipe"],
			env,
		});

		const childPid = child.pid;
		if (!childPid) {
			this.instances.delete(organizationId);
			throw new Error("Failed to spawn host service process");
		}

		instance.pid = childPid;

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
				`Host service failed to start within ${HEALTH_POLL_TIMEOUT}ms`,
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
			DEVICE_CLIENT_ID: getHashedDeviceId(),
			DEVICE_NAME: getDeviceName(),
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
			CLOUD_API_URL: config.cloudApiUrl,
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
