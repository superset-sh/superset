import { existsSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM } from "shared/constants";

/**
 * Returns the IPC socket/pipe path for the terminal host daemon.
 * On Unix, this is a Unix domain socket file inside the superset home directory.
 * On Windows, this is a named pipe (named pipes don't exist as files on disk).
 */
export function getSocketPath(
	supersetDirName: string,
	supersetHomeDir: string,
): string {
	if (PLATFORM.IS_WINDOWS) {
		return `\\\\?\\pipe\\superset-terminal-host-${supersetDirName}`;
	}
	return join(supersetHomeDir, "terminal-host.sock");
}

/**
 * Whether the IPC transport uses a file-based socket (Unix domain socket)
 * rather than a named pipe. Only file-based sockets can be checked with `existsSync`.
 */
export function isFileBasedSocket(): boolean {
	return !PLATFORM.IS_WINDOWS;
}

/**
 * Checks whether the IPC socket/pipe exists.
 * On Unix, checks for the socket file on disk.
 * On Windows, named pipes can't be checked via the filesystem, so assumes true.
 */
export function socketMayExist(socketPath: string): boolean {
	if (!isFileBasedSocket()) return true;
	return existsSync(socketPath);
}
