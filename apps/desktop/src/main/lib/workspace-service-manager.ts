import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

type WorkspaceServiceStatus = "starting" | "running" | "crashed";

interface WorkspaceServiceProcess {
	process: ChildProcess;
	port: number | null;
	status: WorkspaceServiceStatus;
	restartCount: number;
	lastCrash?: number;
	organizationId: string;
}

const MAX_RESTART_DELAY = 30_000;
const BASE_RESTART_DELAY = 1_000;

class WorkspaceServiceManager {
	private instances = new Map<string, WorkspaceServiceProcess>();
	private scriptPath = path.join(__dirname, "workspace-service.js");

	async start(organizationId: string): Promise<number> {
		const existing = this.instances.get(organizationId);
		if (existing?.status === "running" && existing.port !== null) {
			return existing.port;
		}
		if (existing?.status === "starting") {
			return this.waitForPort(organizationId);
		}

		return this.spawn(organizationId);
	}

	stop(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		if (!instance) return;

		instance.status = "crashed"; // prevent restart
		instance.process.kill("SIGTERM");
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

	getStatus(organizationId: string): WorkspaceServiceStatus | null {
		return this.instances.get(organizationId)?.status ?? null;
	}

	private async spawn(organizationId: string): Promise<number> {
		const child = spawn(process.execPath, [this.scriptPath], {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ELECTRON_RUN_AS_NODE: "1" },
		});

		const instance: WorkspaceServiceProcess = {
			process: child,
			port: null,
			status: "starting",
			restartCount: 0,
			organizationId,
		};

		this.instances.set(organizationId, instance);

		child.stderr?.on("data", (data: Buffer) => {
			console.error(
				`[workspace-service:${organizationId}] ${data.toString().trim()}`,
			);
		});

		child.on("exit", (code) => {
			console.log(
				`[workspace-service:${organizationId}] exited with code ${code}`,
			);
			const current = this.instances.get(organizationId);
			if (
				current &&
				current.process === child &&
				current.status !== "crashed"
			) {
				current.status = "crashed";
				current.lastCrash = Date.now();
				this.scheduleRestart(organizationId);
			}
		});

		return this.waitForPort(organizationId);
	}

	private waitForPort(organizationId: string): Promise<number> {
		return new Promise((resolve, reject) => {
			const instance = this.instances.get(organizationId);
			if (!instance) {
				reject(new Error("Instance not found"));
				return;
			}

			if (instance.port !== null) {
				resolve(instance.port);
				return;
			}

			let buffer = "";
			const onData = (data: Buffer) => {
				buffer += data.toString();
				const newlineIdx = buffer.indexOf("\n");
				if (newlineIdx === -1) return;

				const line = buffer.slice(0, newlineIdx);
				instance.process.stdout?.off("data", onData);

				try {
					const parsed = JSON.parse(line) as { port: number };
					instance.port = parsed.port;
					instance.status = "running";
					console.log(
						`[workspace-service:${organizationId}] listening on port ${parsed.port}`,
					);
					resolve(parsed.port);
				} catch {
					reject(
						new Error(`Failed to parse port from workspace-service: ${line}`),
					);
				}
			};

			instance.process.stdout?.on("data", onData);

			// Timeout after 10s
			setTimeout(() => {
				instance.process.stdout?.off("data", onData);
				reject(new Error("Timeout waiting for workspace-service port"));
			}, 10_000);
		});
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
			`[workspace-service:${organizationId}] restarting in ${delay}ms (attempt ${instance.restartCount})`,
		);

		setTimeout(() => {
			const current = this.instances.get(organizationId);
			if (current?.status === "crashed") {
				this.instances.delete(organizationId);
				this.spawn(organizationId).catch((err) => {
					console.error(
						`[workspace-service:${organizationId}] restart failed:`,
						err,
					);
				});
			}
		}, delay);
	}
}

let manager: WorkspaceServiceManager | null = null;

export function getWorkspaceServiceManager(): WorkspaceServiceManager {
	if (!manager) {
		manager = new WorkspaceServiceManager();
	}
	return manager;
}
