/**
 * Remote SSH Workspace Runtime
 *
 * Provides WorkspaceRuntime for remote workspaces connected over SSH.
 * Uses ssh2 for connections, tmux for session persistence, and SFTP for file access.
 */

import {
	getPoolKey,
	RemoteClipboardService,
	RemoteGitService,
	RemoteSSHTerminalRuntime,
	SFTPService,
	SSHConnection,
	SSHConnectionPool,
	type SSHHostConfig,
} from "./remote-ssh/index";
import type {
	TerminalRuntime,
	WorkspaceRuntime,
	WorkspaceRuntimeId,
} from "./types";

/** Shared connection pool across all RemoteSSHWorkspaceRuntime instances */
const _globalPool = new SSHConnectionPool();

export class RemoteSSHWorkspaceRuntime implements WorkspaceRuntime {
	readonly id: WorkspaceRuntimeId;
	readonly terminal: TerminalRuntime;
	readonly capabilities: WorkspaceRuntime["capabilities"];
	readonly git: RemoteGitService;
	readonly sftp: SFTPService;
	readonly clipboard: RemoteClipboardService;
	private connection: SSHConnection | null = null;

	constructor(config: SSHHostConfig) {
		this.config = config;
		this.id = `remote-ssh:${getPoolKey(config)}`;

		// Create a standalone connection for this runtime
		const connection = new SSHConnection(config);
		this.connection = connection;

		// Create services
		const terminalRuntime = new RemoteSSHTerminalRuntime(connection);
		this.terminal = terminalRuntime;
		this.git = new RemoteGitService(connection);
		this.sftp = new SFTPService(connection);
		this.clipboard = new RemoteClipboardService(connection, this.sftp);

		this.capabilities = {
			terminal: terminalRuntime.capabilities,
		};
	}

	/**
	 * Lazily initialize the SSH connection.
	 * Called by the registry before returning the runtime.
	 */
	async ensureConnected(): Promise<void> {
		if (this.connection && !this.connection.isConnected) {
			await this.connection.connect();
		}

		// Deploy clipboard proxy scripts after connection is established
		await this.clipboard.ensureProxyScripts().catch((err) => {
			console.warn(
				"[RemoteSSHWorkspaceRuntime] Clipboard proxy deploy failed:",
				err,
			);
		});
	}

	/**
	 * Disconnect and clean up.
	 */
	async dispose(): Promise<void> {
		await this.terminal.cleanup();
		this.connection?.disconnect();
	}
}
