import { SshConnectionManager } from "./ssh-connection-manager";

export { parseSshConfig } from "./ssh-config-parser";
export { SshConnectionManager } from "./ssh-connection-manager";
export type {
	SshConnectionEvents,
	SshConnectionInfo,
	SshConnectionState,
	SshHostConfig,
	SshSessionInfo,
} from "./types";

let sshConnectionManager: SshConnectionManager | null = null;

/**
 * Returns the singleton SshConnectionManager instance, creating it lazily on
 * first call. Mirrors the getDaemonTerminalManager() pattern used elsewhere in
 * the desktop app.
 */
export function getSshConnectionManager(): SshConnectionManager {
	if (!sshConnectionManager) {
		sshConnectionManager = new SshConnectionManager();
	}
	return sshConnectionManager;
}
