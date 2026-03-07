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

export const TERMINAL_HOST_RUNTIME_PATHS = getRuntimePaths({
	baseName: "terminal-host",
	logFilename: "daemon.log",
});

export const TERMINAL_SUPERVISOR_RUNTIME_PATHS = getRuntimePaths({
	baseName: "terminal-supervisor",
	logFilename: "terminal-supervisor.log",
});
