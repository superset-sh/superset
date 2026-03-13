import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const execAsync = promisify(exec);

interface ServiceStatus {
	name: string;
	port: number;
	running: boolean;
	processAlive: boolean;
	uptimeSeconds: number | null;
	restartCommand: string;
}

function checkPort(port: number, timeout = 1000): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ port, host: "127.0.0.1" }, () => {
			socket.destroy();
			resolve(true);
		});
		socket.setTimeout(timeout);
		socket.on("timeout", () => {
			socket.destroy();
			resolve(false);
		});
		socket.on("error", () => {
			socket.destroy();
			resolve(false);
		});
	});
}

async function isProcessAlive(pattern: string): Promise<boolean> {
	try {
		const { stdout } = await execAsync(`pgrep -f "${pattern}" 2>/dev/null`);
		return stdout.trim().length > 0;
	} catch {
		return false;
	}
}

function resolveFrontendPort(worktreePath: string): number {
	// 1. Check env files for FRONTEND_PORT
	const envPaths = [
		join(worktreePath, "frontend", ".env.local"),
		join(worktreePath, "frontend", ".env"),
		join(worktreePath, ".env"),
	];
	for (const envPath of envPaths) {
		try {
			if (!existsSync(envPath)) continue;
			const content = readFileSync(envPath, "utf-8");
			const match = content.match(/^FRONTEND_PORT\s*=\s*(\d+)/m);
			if (match) return Number.parseInt(match[1], 10);
		} catch {
			// continue
		}
	}

	// 2. Parse vite.config.ts for default port
	try {
		const viteConfig = join(worktreePath, "frontend", "vite.config.ts");
		if (existsSync(viteConfig)) {
			const content = readFileSync(viteConfig, "utf-8");
			const match = content.match(/FRONTEND_PORT\s*\?\?\s*['"](\d+)['"]/);
			if (match) return Number.parseInt(match[1], 10);
		}
	} catch {
		// continue
	}

	return 8080;
}

interface ServiceDef {
	name: string;
	port: number;
	processPattern: string;
	restartCommand: string;
}

function getServices(worktreePath: string): ServiceDef[] {
	const frontendPort = resolveFrontendPort(worktreePath);
	return [
		{
			name: "Supabase",
			port: 54322,
			processPattern: "supabase",
			restartCommand: "supabase start",
		},
		{
			name: "Docker",
			port: 2375,
			processPattern: "com.docker",
			restartCommand: "open -a Docker",
		},
		{
			name: "Frontend",
			port: frontendPort,
			processPattern: `vite.*${frontendPort}`,
			restartCommand: "npm run frontend:dev",
		},
		{
			name: "Droplet",
			port: 8787,
			processPattern: "droplet.*8787",
			restartCommand: "npm run droplet:start",
		},
	];
}

// Track when services were first seen running
const serviceStartTimes = new Map<string, number>();

export const createServiceHealthRouter = () => {
	return router({
		getServiceHealth: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(async ({ input }): Promise<ServiceStatus[]> => {
				const services = getServices(input.worktreePath);
				const now = Date.now();
				const results = await Promise.all(
					services.map(async (service) => {
						const [portUp, procAlive] = await Promise.all([
							checkPort(service.port),
							isProcessAlive(service.processPattern),
						]);
						const running = portUp || procAlive;

						if (running) {
							if (!serviceStartTimes.has(service.name)) {
								serviceStartTimes.set(service.name, now);
							}
						} else {
							serviceStartTimes.delete(service.name);
						}

						const startTime = serviceStartTimes.get(service.name);
						return {
							name: service.name,
							port: service.port,
							running,
							processAlive: procAlive,
							uptimeSeconds: startTime
								? Math.floor((now - startTime) / 1000)
								: null,
							restartCommand: service.restartCommand,
						};
					}),
				);
				return results;
			}),

		restartService: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					serviceName: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const services = getServices(input.worktreePath);
				const service = services.find((s) => s.name === input.serviceName);
				if (!service) {
					return { success: false, error: "Unknown service" };
				}
				try {
					await execAsync(service.restartCommand, {
						cwd: input.worktreePath,
						timeout: 30_000,
					});
					serviceStartTimes.delete(service.name);
					return { success: true };
				} catch (error) {
					return {
						success: false,
						error: error instanceof Error ? error.message : "Restart failed",
					};
				}
			}),
	});
};
