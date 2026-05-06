import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { env } from "../env";
import {
	type HostServiceManifest,
	hostDbPath,
	writeManifest,
} from "./manifest";

const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_TIMEOUT_MS = 10_000;

export interface SpawnHostOptions {
	organizationId: string;
	sessionToken: string;
	port?: number;
	daemon: boolean;
}

export interface SpawnHostResult {
	pid: number;
	port: number;
	secret: string;
}

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

async function pollHealth(port: number, secret: string): Promise<boolean> {
	const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 2_000);
			const res = await fetch(`http://127.0.0.1:${port}/trpc/health.check`, {
				signal: controller.signal,
				headers: { Authorization: `Bearer ${secret}` },
			});
			clearTimeout(timeout);
			if (res.ok) return true;
		} catch {
			// not ready
		}
		await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
	}
	return false;
}

/**
 * Resolve the sibling `superset-host` wrapper binary.
 *
 * When running as a compiled binary, it's a sibling file in the same bin/
 * directory as the current executable. In dev (`bun run dev`), allow
 * override via SUPERSET_HOST_BIN env var.
 */
function resolveHostBinary(): string {
	if (process.env.SUPERSET_HOST_BIN) return process.env.SUPERSET_HOST_BIN;
	const cliBin = process.execPath;
	return join(dirname(cliBin), "superset-host");
}

function resolveMigrationsFolder(): string {
	if (process.env.HOST_MIGRATIONS_FOLDER) {
		return process.env.HOST_MIGRATIONS_FOLDER;
	}
	// Compiled layout: <bundle>/bin/superset → <bundle>/share/migrations
	const cliBin = process.execPath;
	const bundleRoot = dirname(dirname(cliBin));
	return join(bundleRoot, "share", "migrations");
}

export async function spawnHostService(
	options: SpawnHostOptions,
): Promise<SpawnHostResult> {
	const hostBin = resolveHostBinary();
	if (!existsSync(hostBin)) {
		throw new Error(
			`superset-host binary not found at ${hostBin}. Set SUPERSET_HOST_BIN to override.`,
		);
	}

	const port = options.port ?? (await findFreePort());
	const secret = randomBytes(32).toString("hex");
	const migrationsFolder = resolveMigrationsFolder();

	const child = spawn(hostBin, [], {
		stdio: options.daemon ? "ignore" : "inherit",
		detached: options.daemon,
		env: {
			...process.env,
			ORGANIZATION_ID: options.organizationId,
			AUTH_TOKEN: options.sessionToken,
			SUPERSET_API_URL: env.SUPERSET_API_URL,
			RELAY_URL: env.RELAY_URL,
			PORT: String(port),
			HOST_SERVICE_PORT: String(port),
			HOST_SERVICE_SECRET: secret,
			HOST_DB_PATH: hostDbPath(options.organizationId),
			HOST_MIGRATIONS_FOLDER: migrationsFolder,
		},
	});

	if (!child.pid) {
		throw new Error("Failed to spawn host-service");
	}

	const healthy = await pollHealth(port, secret);
	if (!healthy) {
		child.kill("SIGTERM");
		throw new Error(
			`Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
		);
	}

	const manifest: HostServiceManifest = {
		pid: child.pid,
		endpoint: `http://127.0.0.1:${port}`,
		authToken: secret,
		startedAt: Date.now(),
		organizationId: options.organizationId,
	};
	writeManifest(manifest);

	if (options.daemon) {
		child.unref();
	}

	return { pid: child.pid, port, secret };
}
