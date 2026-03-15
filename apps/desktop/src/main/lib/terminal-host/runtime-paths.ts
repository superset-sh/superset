import { readdirSync } from "node:fs";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";

export interface TerminalDaemonRuntimePaths {
	socketPath: string;
	tokenPath: string;
	pidPath: string;
	spawnLockPath: string;
	scriptMtimePath: string;
	logPath: string;
}

export const TERMINAL_WORKER_GENERATION_ENV =
	"SUPERSET_TERMINAL_WORKER_GENERATION";
const TERMINAL_WORKER_FILENAME_PREFIX = "terminal-worker.";
const TERMINAL_WORKER_SOCKET_SUFFIX = ".sock";

function getRuntimePaths({
	baseName,
	logFilename,
}: {
	baseName: string;
	logFilename: string;
}): TerminalDaemonRuntimePaths {
	return {
		socketPath: join(SUPERSET_HOME_DIR, `${baseName}.sock`),
		tokenPath: join(SUPERSET_HOME_DIR, `${baseName}.token`),
		pidPath: join(SUPERSET_HOME_DIR, `${baseName}.pid`),
		spawnLockPath: join(SUPERSET_HOME_DIR, `${baseName}.spawn.lock`),
		scriptMtimePath: join(SUPERSET_HOME_DIR, `${baseName}.mtime`),
		logPath: join(SUPERSET_HOME_DIR, logFilename),
	};
}

export function sanitizeTerminalWorkerGeneration(generation: string): string {
	return generation.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export const TERMINAL_HOST_RUNTIME_PATHS = getRuntimePaths({
	baseName: "terminal-host",
	logFilename: "daemon.log",
});

export const TERMINAL_SUPERVISOR_RUNTIME_PATHS = getRuntimePaths({
	baseName: "terminal-supervisor",
	logFilename: "terminal-supervisor.log",
});

export function getTerminalWorkerRuntimePaths(
	generation: string,
): TerminalDaemonRuntimePaths {
	const suffix = sanitizeTerminalWorkerGeneration(generation);
	return getRuntimePaths({
		baseName: `terminal-worker.${suffix}`,
		logFilename: `terminal-worker.${suffix}.log`,
	});
}

export function listTerminalWorkerGenerations(): string[] {
	try {
		return readdirSync(SUPERSET_HOME_DIR)
			.filter(
				(entry) =>
					entry.startsWith(TERMINAL_WORKER_FILENAME_PREFIX) &&
					entry.endsWith(TERMINAL_WORKER_SOCKET_SUFFIX),
			)
			.map((entry) =>
				entry.slice(
					TERMINAL_WORKER_FILENAME_PREFIX.length,
					-TERMINAL_WORKER_SOCKET_SUFFIX.length,
				),
			)
			.filter((entry) => entry.length > 0)
			.sort((a, b) =>
				a.localeCompare(b, undefined, {
					numeric: true,
					sensitivity: "base",
				}),
			);
	} catch {
		return [];
	}
}
