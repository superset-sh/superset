import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";

export const LEGACY_DAEMON_SOCKET_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-host.sock",
);

export const LEGACY_DAEMON_TOKEN_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-host.token",
);

export const LEGACY_DAEMON_PID_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-host.pid",
);

export function getDaemonSocketPath(generationId: string): string {
	return join(SUPERSET_HOME_DIR, `terminal-host.${generationId}.sock`);
}

export function getDaemonTokenPath(generationId: string): string {
	return join(SUPERSET_HOME_DIR, `terminal-host.${generationId}.token`);
}

export function getDaemonPidPath(generationId: string): string {
	return join(SUPERSET_HOME_DIR, `terminal-host.${generationId}.pid`);
}

export function getDaemonSpawnLockPath(generationId: string): string {
	return join(SUPERSET_HOME_DIR, `terminal-host.${generationId}.spawn.lock`);
}

export function getDaemonScriptMtimePath(generationId: string): string {
	return join(SUPERSET_HOME_DIR, `terminal-host.${generationId}.mtime`);
}
