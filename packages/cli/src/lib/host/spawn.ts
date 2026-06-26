import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import type { ApiClient } from "../api-client";
import { env } from "../env";
import {
	type HostServiceManifest,
	hostDbPath,
	writeManifest,
} from "./manifest";
import { getRelayUrl } from "./relay-url";

const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_TIMEOUT_MS = 10_000;
// Failed startup means the host process never became healthy, so an
// aggressive 1s SIGTERM->SIGKILL window is intentional: we want the port
// released for the caller's retry, not a graceful drain.
const KILL_GRACE_PERIOD_MS = 1_000;
const KILL_HARD_DEADLINE_MS = 4_000;

export interface SpawnHostOptions {
	organizationId: string;
	sessionToken: string;
	authConfigPath?: string;
	api: ApiClient;
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
		const onError = (err: Error) => {
			server.removeListener("listening", onListening);
			reject(err);
		};
		const onListening = () => {
			server.removeListener("error", onError);
			const addr = server.address();
			if (!addr || typeof addr !== "object") {
				server.close();
				reject(new Error("Could not get port"));
				return;
			}
			const { port } = addr;
			server.close((closeErr) => {
				if (closeErr) reject(closeErr);
				else resolve(port);
			});
		};
		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(0, "127.0.0.1");
	});
}

/**
 * Send SIGTERM, then escalate to SIGKILL if the child is still alive after a
 * short grace period. Resolves once the child has actually exited (or after
 * the kill window elapses), so callers don't return while a zombie is still
 * holding the port. `ChildProcess.kill()` returns false when the OS reports
 * the process is already gone (ESRCH); we treat that as "already exited" so
 * we don't wait on an exit event that won't fire.
 */
async function terminateChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve) => {
		let settled = false;
		// Declare the timer handles up front so `finish()` can always
		// reach them. If `finish()` runs before the timers are set
		// (kill() throws or returns false) these stay undefined, and
		// the clearTimeout guards below are no-ops.
		let escalation: ReturnType<typeof setTimeout> | undefined;
		let hardDeadline: ReturnType<typeof setTimeout> | undefined;
		const finish = () => {
			if (settled) return;
			settled = true;
			if (escalation) clearTimeout(escalation);
			if (hardDeadline) clearTimeout(hardDeadline);
			child.removeListener("exit", onExit);
			resolve();
		};
		const onExit = () => finish();
		child.once("exit", onExit);
		let sentSignal: boolean;
		try {
			sentSignal = child.kill("SIGTERM");
		} catch {
			finish();
			return;
		}
		if (!sentSignal) {
			// kill() returned false: the OS says the process is already gone.
			// No exit event will fire, so resolve now.
			finish();
			return;
		}
		escalation = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {
				// Process already gone; the hardDeadline will resolve us.
			}
		}, KILL_GRACE_PERIOD_MS);
		escalation.unref();
		// Absolute backstop so we don't hang the CLI if the OS misses the exit event.
		hardDeadline = setTimeout(finish, KILL_HARD_DEADLINE_MS);
		hardDeadline.unref();
	});
}

async function pollHealth(
	port: number,
	secret: string,
	hasExited: () => boolean = () => false,
): Promise<boolean> {
	const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (hasExited()) return false;
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
	const relayUrl = await getRelayUrl(options.api);

	const child = spawn(hostBin, [], {
		stdio: options.daemon ? "ignore" : "inherit",
		detached: options.daemon,
		env: {
			...process.env,
			ORGANIZATION_ID: options.organizationId,
			AUTH_TOKEN: options.sessionToken,
			...(options.authConfigPath
				? { SUPERSET_AUTH_CONFIG_PATH: options.authConfigPath }
				: {}),
			SUPERSET_API_URL: env.SUPERSET_API_URL,
			RELAY_URL: relayUrl,
			PORT: String(port),
			HOST_SERVICE_PORT: String(port),
			HOST_SERVICE_SECRET: secret,
			HOST_DB_PATH: hostDbPath(options.organizationId),
			HOST_MIGRATIONS_FOLDER: migrationsFolder,
		},
	});

	// Attach the 'error' listener immediately after spawn, before the pid
	// check. Spawn failures (e.g. ENOENT) emit 'error' asynchronously and
	// would crash the CLI as an unhandled event if no listener is attached
	// by the time the event loop processes them. `once` auto-detaches so a
	// later error after startup doesn't fire into a stale closure.
	let spawnError: Error | null = null;
	const onSpawnError = (err: Error) => {
		spawnError = err;
	};
	child.once("error", onSpawnError);

	if (!child.pid) {
		throw new Error("Failed to spawn host-service");
	}

	// Track early exit so health-check can stop polling instead of waiting
	// for the full timeout when the child already died. Same detach pattern
	// as above: once startup succeeds, we no longer care about this exit.
	type ExitInfo = { code: number | null; signal: NodeJS.Signals | null };
	const exitRef: { current: ExitInfo | null } = { current: null };
	const onStartupExit = (
		code: number | null,
		signal: NodeJS.Signals | null,
	) => {
		exitRef.current = { code, signal };
	};
	child.once("exit", onStartupExit);

	const healthy = await pollHealth(
		port,
		secret,
		() => exitRef.current !== null,
	);
	if (!healthy) {
		// Always wait for actual termination so the port is released before
		// we throw. Otherwise the caller's retry sees EADDRINUSE.
		await terminateChild(child);
		if (spawnError) throw spawnError;
		const exit = exitRef.current;
		if (exit) {
			throw new Error(
				`Host service exited during startup (code=${exit.code}, signal=${exit.signal})`,
			);
		}
		throw new Error(
			`Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
		);
	}

	// Healthy: detach the startup-only listeners so any later
	// 'error'/'exit' events surface through normal Node behavior instead
	// of being silently captured by closure refs we no longer read.
	// removeListener is a no-op for `once` listeners that already fired.
	child.removeListener("error", onSpawnError);
	child.removeListener("exit", onStartupExit);

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
