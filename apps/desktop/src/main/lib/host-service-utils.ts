import * as fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

/** Rotate per-org host-service.log once it exceeds this size. */
export const MAX_HOST_LOG_BYTES = 5 * 1024 * 1024;

export const HEALTH_POLL_TIMEOUT_MS = 10_000;

const HEALTH_POLL_INTERVAL_MS = 200;

/**
 * Open an append-mode log fd, truncating first if it exceeds maxBytes.
 * Returns -1 on failure so callers can fall back to ignoring child stdio.
 */
export function openRotatingLogFd(logPath: string, maxBytes: number): number {
	try {
		fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
		if (fs.existsSync(logPath)) {
			try {
				const { size } = fs.statSync(logPath);
				if (size > maxBytes) {
					fs.writeFileSync(logPath, "", { mode: 0o600 });
				}
			} catch {
				// Best-effort rotate
			}
		}
		const fd = fs.openSync(logPath, "a", 0o600);
		// openSync's mode arg only applies on create — normalize an existing
		// file's perms in case it was rotated out-of-band with laxer bits.
		try {
			fs.chmodSync(logPath, 0o600);
		} catch (error) {
			console.warn(
				`[host-service] Failed to chmod log file ${logPath}: ${error}`,
			);
		}
		return fd;
	} catch (error) {
		console.warn(`[host-service] Failed to open log file ${logPath}: ${error}`);
		return -1;
	}
}

export async function findFreePort(
	preferredPorts: Iterable<number> = [],
): Promise<number> {
	const triedPorts = new Set<number>();
	for (const port of preferredPorts) {
		const normalizedPort = normalizePort(port);
		if (!normalizedPort || triedPorts.has(normalizedPort)) continue;
		triedPorts.add(normalizedPort);
		if (await canBindPort(normalizedPort)) return normalizedPort;
	}

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

function normalizePort(port: number): number | null {
	if (!Number.isInteger(port) || port <= 0 || port > 65_535) return null;
	return port;
}

function canBindPort(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		const finish = (available: boolean) => {
			server.removeAllListeners("error");
			server.removeAllListeners("listening");
			if (!available) {
				resolve(false);
				return;
			}
			server.close(() => resolve(true));
		};

		server.once("error", () => finish(false));
		server.once("listening", () => finish(true));
		server.listen(port, "127.0.0.1");
	});
}

export async function pollHealthCheck(
	endpoint: string,
	secret: string,
	timeoutMs = HEALTH_POLL_TIMEOUT_MS,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2_000);
		try {
			const res = await fetch(`${endpoint}/trpc/health.check`, {
				signal: controller.signal,
				headers: { Authorization: `Bearer ${secret}` },
			});
			if (res.ok) return true;
		} catch {
			// Not ready yet
		} finally {
			clearTimeout(timeout);
		}
		await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
	}
	return false;
}
