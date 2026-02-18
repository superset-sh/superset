/**
 * SSH Connection Types
 *
 * Configuration and state types for remote SSH workspace connections.
 */

export interface SSHHostConfig {
	/** sshConnections table ID */
	id: string;
	host: string;
	port: number;
	username: string;
	/** Explicit key path; if omitted, try agent + defaults */
	identityFile?: string;
	/** Use SSH_AUTH_SOCK (default true) */
	useAgent?: boolean;
}

export interface SSHConnectionState {
	status: "disconnected" | "connecting" | "connected" | "reconnecting";
	lastError?: string;
	reconnectAttempt?: number;
}

/** Connection pool key: "user@host:port" */
export type SSHConnectionPoolKey = string;

export function getPoolKey(config: SSHHostConfig): SSHConnectionPoolKey {
	return `${config.username}@${config.host}:${config.port}`;
}
