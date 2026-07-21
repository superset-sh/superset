import * as fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

/** Rotate per-org host-service.log once it exceeds this size. */
export const MAX_HOST_LOG_BYTES = 5 * 1024 * 1024;

// Before the server becomes reachable, startup must still clear DB migrate and
// the daemon bootstrap (the shell-env snapshot now runs in the background, off
// the critical path). At boot every known org starts at once, and multiple app
// instances sharing one $SUPERSET_HOME_DIR compound the contention, so a
// healthy-but-slow child can need well over 10s. Give it generous headroom; a
// genuinely dead child is detected early via the poll's abort hook rather than
// by this deadline.
export const HEALTH_POLL_TIMEOUT_MS = 30_000;

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
	// Bail out before the deadline once the child is known dead — otherwise a
	// crash-on-startup would stall the caller for the full (now generous)
	// timeout instead of failing fast.
	shouldAbort?: () => boolean,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (shouldAbort?.()) return false;
		const controller = new AbortController();
		// Clamp both the fetch and the retry sleep to the remaining budget so
		// a call never runs meaningfully past its advertised timeout — the
		// watchdog probes instances serially and relies on this bound.
		const fetchBudget = Math.min(2_000, deadline - Date.now());
		const timeout = setTimeout(() => controller.abort(), fetchBudget);
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
		const sleepBudget = Math.min(
			HEALTH_POLL_INTERVAL_MS,
			deadline - Date.now(),
		);
		if (sleepBudget <= 0) break;
		await new Promise((r) => setTimeout(r, sleepBudget));
	}
	return false;
}
