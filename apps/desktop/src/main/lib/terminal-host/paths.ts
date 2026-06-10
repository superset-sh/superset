import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { SUPERSET_DIR_NAME } from "shared/constants";

export const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);

export function getTerminalHostSocketPath({
	homeDir = SUPERSET_HOME_DIR,
	platform = process.platform,
}: {
	homeDir?: string;
	platform?: NodeJS.Platform;
} = {}): string {
	if (platform === "win32") {
		const id = createHash("sha256").update(homeDir).digest("hex").slice(0, 12);
		return String.raw`\\.\pipe\superset-terminal-host-${id}`;
	}

	return join(homeDir, "terminal-host.sock");
}

export function isTerminalHostNamedPipe(socketPath: string): boolean {
	return /^\\\\[.?]\\pipe\\/i.test(socketPath);
}

export const TERMINAL_HOST_SOCKET_PATH = getTerminalHostSocketPath();
export const TERMINAL_HOST_TOKEN_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-host.token",
);
export const TERMINAL_HOST_PID_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-host.pid",
);
export const TERMINAL_HOST_SPAWN_LOCK_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-host.spawn.lock",
);
export const TERMINAL_HOST_SCRIPT_MTIME_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-host.mtime",
);
