import { EventEmitter } from "node:events";
import * as pty from "node-pty";

const DEBUG_SSH = process.env.SUPERSET_SSH_DEBUG === "1";

export interface SSHCredentials {
	host: string;
	port: number;
	username: string;
	token?: string;
}

export interface SSHSession {
	paneId: string;
	cloudWorkspaceId: string;
	pty: pty.IPty;
	isAlive: boolean;
	cols: number;
	rows: number;
	startTime: number;
	lastActive: number;
}

export interface CreateSSHSessionParams {
	paneId: string;
	cloudWorkspaceId: string;
	credentials: SSHCredentials;
	cols?: number;
	rows?: number;
}

export interface SSHSessionResult {
	paneId: string;
	isNew: boolean;
}

/**
 * SSH Terminal Manager - manages SSH connections to cloud workspaces
 * Uses node-pty to spawn SSH processes
 */
export class SSHManager extends EventEmitter {
	private sessions = new Map<string, SSHSession>();

	/**
	 * Create a new SSH session to a cloud workspace
	 */
	async createSession(
		params: CreateSSHSessionParams,
	): Promise<SSHSessionResult> {
		const {
			paneId,
			cloudWorkspaceId,
			credentials,
			cols = 80,
			rows = 24,
		} = params;

		// Return existing session if alive
		const existing = this.sessions.get(paneId);
		if (existing?.isAlive) {
			existing.lastActive = Date.now();
			if (cols !== undefined && rows !== undefined) {
				this.resize({ paneId, cols, rows });
			}
			return { paneId, isNew: false };
		}

		if (DEBUG_SSH) {
			console.log("[SSHManager] Creating SSH session:", {
				paneId,
				cloudWorkspaceId,
				host: credentials.host,
				port: credentials.port,
			});
		}

		// Build SSH command arguments
		// For Freestyle: ssh {vmId}:{token}@vm-ssh.freestyle.sh
		const sshArgs = this.buildSSHArgs(credentials);

		// Spawn SSH process using node-pty
		const shell = process.platform === "win32" ? "ssh.exe" : "ssh";
		const ptyProcess = pty.spawn(shell, sshArgs, {
			name: "xterm-256color",
			cols,
			rows,
			cwd: process.env.HOME,
			env: {
				...process.env,
				TERM: "xterm-256color",
			},
		});

		const session: SSHSession = {
			paneId,
			cloudWorkspaceId,
			pty: ptyProcess,
			isAlive: true,
			cols,
			rows,
			startTime: Date.now(),
			lastActive: Date.now(),
		};

		// Set up data handler
		ptyProcess.onData((data) => {
			session.lastActive = Date.now();
			this.emit(`data:${paneId}`, data);
		});

		// Set up exit handler
		ptyProcess.onExit(({ exitCode, signal }) => {
			if (DEBUG_SSH) {
				console.log("[SSHManager] SSH session exited:", {
					paneId,
					exitCode,
					signal,
					duration: Date.now() - session.startTime,
				});
			}

			session.isAlive = false;
			this.emit(`exit:${paneId}`, exitCode, signal);

			// Clean up after delay, but only if no new session replaced it
			setTimeout(() => {
				const currentSession = this.sessions.get(paneId);
				if (currentSession === session) {
					this.sessions.delete(paneId);
				}
			}, 5000);
		});

		this.sessions.set(paneId, session);

		if (DEBUG_SSH) {
			console.log("[SSHManager] SSH session created:", paneId);
		}

		return { paneId, isNew: true };
	}

	/**
	 * Build SSH command arguments
	 */
	private buildSSHArgs(credentials: SSHCredentials): string[] {
		const args: string[] = [];

		// Disable strict host key checking for cloud VMs (they're ephemeral)
		args.push("-o", "StrictHostKeyChecking=no");
		args.push("-o", "UserKnownHostsFile=/dev/null");

		// Set connection timeout
		args.push("-o", "ConnectTimeout=30");

		// Keep connection alive
		args.push("-o", "ServerAliveInterval=30");
		args.push("-o", "ServerAliveCountMax=3");

		// Port
		if (credentials.port !== 22) {
			args.push("-p", String(credentials.port));
		}

		// User@host
		// For Freestyle: username is "{vmId}:{token}"
		args.push(`${credentials.username}@${credentials.host}`);

		return args;
	}

	/**
	 * Write data to SSH session
	 */
	write(params: { paneId: string; data: string }): void {
		const { paneId, data } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			throw new Error(`SSH session ${paneId} not found or not alive`);
		}

		session.pty.write(data);
		session.lastActive = Date.now();
	}

	/**
	 * Resize SSH terminal
	 */
	resize(params: { paneId: string; cols: number; rows: number }): void {
		const { paneId, cols, rows } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot resize SSH session ${paneId}: not found or not alive`,
			);
			return;
		}

		try {
			session.pty.resize(cols, rows);
			session.cols = cols;
			session.rows = rows;
			session.lastActive = Date.now();
		} catch (error) {
			console.error(`[SSHManager] Failed to resize session ${paneId}:`, error);
		}
	}

	/**
	 * Kill SSH session
	 */
	async kill(params: { paneId: string }): Promise<void> {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(`Cannot kill SSH session ${paneId}: not found`);
			return;
		}

		if (session.isAlive) {
			session.pty.kill();
		} else {
			this.sessions.delete(paneId);
		}
	}

	/**
	 * Get session info
	 */
	getSession(paneId: string): { isAlive: boolean; lastActive: number } | null {
		const session = this.sessions.get(paneId);
		if (!session) {
			return null;
		}

		return {
			isAlive: session.isAlive,
			lastActive: session.lastActive,
		};
	}

	/**
	 * Kill all sessions for a cloud workspace
	 */
	async killByCloudWorkspaceId(
		cloudWorkspaceId: string,
	): Promise<{ killed: number }> {
		const sessionsToKill = Array.from(this.sessions.entries()).filter(
			([, session]) => session.cloudWorkspaceId === cloudWorkspaceId,
		);

		for (const [paneId] of sessionsToKill) {
			await this.kill({ paneId });
		}

		return { killed: sessionsToKill.length };
	}

	/**
	 * Clean up all sessions
	 */
	async cleanup(): Promise<void> {
		for (const [_paneId, session] of this.sessions.entries()) {
			if (session.isAlive) {
				session.pty.kill();
			}
		}
		this.sessions.clear();
		this.removeAllListeners();
	}
}

/** Singleton SSH manager instance */
export const sshManager = new SSHManager();
