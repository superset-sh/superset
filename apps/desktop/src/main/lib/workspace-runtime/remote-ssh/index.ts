/**
 * Remote SSH Module - Barrel Exports
 */

export { RemoteClipboardService } from "./clipboard-service";
export type { SSHConnectionEvents } from "./connection";
export { SSHConnection } from "./connection";
export { SSHConnectionPool } from "./connection-pool";
export type { RemoteWorktreeInfo } from "./git-service";
export { RemoteGitService } from "./git-service";
export type { ReconnectStrategy } from "./reconnect-strategy";
export {
	defaultReconnectStrategy,
	waitForReconnect,
} from "./reconnect-strategy";
export type { CreateOrAttachResult, RemoteSessionCallbacks } from "./session";
export { RemoteSSHSession } from "./session";
export type { RemoteFileInfo } from "./sftp-service";
export { SFTPService } from "./sftp-service";
export type { ResolvedSSHAuth } from "./ssh-key-resolver";
export {
	isSSHAgentAvailable,
	listSSHKeys,
	resolveSSHAuth,
} from "./ssh-key-resolver";
export { RemoteSSHTerminalRuntime } from "./terminal-runtime";
export { TmuxManager } from "./tmux-manager";
export type {
	SSHConnectionPoolKey,
	SSHConnectionState,
	SSHHostConfig,
} from "./types";
export { getPoolKey } from "./types";
