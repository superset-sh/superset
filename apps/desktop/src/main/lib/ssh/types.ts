/**
 * SSH Types
 *
 * Type definitions for SSH remote workspace connections.
 * These types support connecting to remote servers for terminal sessions.
 */

/**
 * SSH authentication method
 */
export type SSHAuthMethod = "key" | "password" | "agent";

/**
 * SSH connection configuration stored in database
 */
export interface SSHConnectionConfig {
	/** Unique identifier for this SSH config */
	id: string;
	/** Display name for the connection */
	name: string;
	/** Remote host address (IP or hostname) */
	host: string;
	/** SSH port (default: 22) */
	port: number;
	/** Username for SSH connection */
	username: string;
	/** Authentication method */
	authMethod: SSHAuthMethod;
	/** Path to private key file (for key auth) */
	privateKeyPath?: string;
	/** Use SSH agent forwarding */
	agentForward?: boolean;
	/** Remote working directory (default: home directory) */
	remoteWorkDir?: string;
	/** Keep-alive interval in seconds (default: 60) */
	keepAliveInterval?: number;
	/** Connection timeout in milliseconds (default: 30000) */
	connectionTimeout?: number;
}

/**
 * SSH connection state
 */
export type SSHConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error"
	| "reconnecting";

/**
 * SSH connection status event
 */
export interface SSHConnectionStatus {
	state: SSHConnectionState;
	error?: string;
	/** Reconnect attempt number (if reconnecting) */
	reconnectAttempt?: number;
}

/**
 * SSH session information
 */
export interface SSHSessionInfo {
	paneId: string;
	workspaceId: string;
	cwd: string;
	isAlive: boolean;
	lastActive: number;
}

/**
 * Parameters for creating an SSH terminal session
 */
export interface CreateSSHSessionParams {
	paneId: string;
	tabId: string;
	workspaceId: string;
	workspaceName?: string;
	/** Remote working directory */
	cwd?: string;
	cols?: number;
	rows?: number;
	/** SSH connection configuration */
	sshConfig: SSHConnectionConfig;
	/** Initial commands to run after connection */
	initialCommands?: string[];
}

/**
 * Result of creating or attaching to an SSH session
 */
export interface SSHSessionResult {
	isNew: boolean;
	/** Any initial output from the session */
	scrollback: string;
	wasRecovered: boolean;
	viewportY?: number;
}
