/**
 * SSH Terminal Manager
 *
 * Manages SSH terminal sessions. Implements the same interface as
 * the local TerminalManager to allow seamless swapping via the
 * WorkspaceRuntime abstraction.
 */

import { EventEmitter } from "node:events";
import type { SSHConnectionConfig, SSHSessionInfo } from "./types";
import { SSHClient } from "./ssh-client";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

interface SSHSession {
	paneId: string;
	workspaceId: string;
	cwd: string;
	cols: number;
	rows: number;
	lastActive: number;
	isAlive: boolean;
	viewportY?: number;
}

/** Stored event handlers for cleanup */
interface SessionHandlers {
	data: (data: string) => void;
	exit: (exitCode: number, signal?: number) => void;
	error: (error: string) => void;
}

export class SSHTerminalManager extends EventEmitter {
	private sshClient: SSHClient;
	private sessions: Map<string, SSHSession> = new Map();
	private sessionHandlers: Map<string, SessionHandlers> = new Map();
	private pendingCreates: Map<string, Promise<unknown>> = new Map();
	private config: SSHConnectionConfig;

	constructor(config: SSHConnectionConfig) {
		super();
		this.config = config;
		this.sshClient = new SSHClient(config);
		this.setupEventForwarding();
	}

	private setupEventForwarding(): void {
		// Forward connection status events
		this.sshClient.on("connectionStatus", (status) => {
			this.emit("connectionStatus", status);
		});
	}

	/**
	 * Connect to the remote SSH server
	 */
	async connect(): Promise<void> {
		await this.sshClient.connect();
	}

	/**
	 * Disconnect from the remote SSH server
	 */
	disconnect(): void {
		// Remove all session handlers before disconnecting
		for (const [paneId, handlers] of this.sessionHandlers) {
			this.sshClient.off(`data:${paneId}`, handlers.data);
			this.sshClient.off(`exit:${paneId}`, handlers.exit);
			this.sshClient.off(`error:${paneId}`, handlers.error);
		}
		this.sessionHandlers.clear();
		this.sshClient.disconnect();
		this.sessions.clear();
	}

	/** Removes event handlers for a specific session to prevent listener leaks */
	private cleanupSessionHandlers(paneId: string): void {
		const handlers = this.sessionHandlers.get(paneId);
		if (handlers) {
			this.sshClient.off(`data:${paneId}`, handlers.data);
			this.sshClient.off(`exit:${paneId}`, handlers.exit);
			this.sshClient.off(`error:${paneId}`, handlers.error);
			this.sessionHandlers.delete(paneId);
		}
	}

	/**
	 * Check if connected to SSH server
	 */
	isConnected(): boolean {
		return this.sshClient.isConnected();
	}

	/**
	 * Get the SSH configuration
	 */
	getConfig(): SSHConnectionConfig {
		return this.config;
	}

	/**
	 * Create a new terminal session or attach to existing one
	 */
	async createOrAttach(params: {
		paneId: string;
		tabId: string;
		workspaceId: string;
		workspaceName?: string;
		workspacePath?: string;
		rootPath?: string;
		cwd?: string;
		cols?: number;
		rows?: number;
		initialCommands?: string[];
	}): Promise<{
		isNew: boolean;
		scrollback: string;
		wasRecovered: boolean;
		viewportY?: number;
	}> {
		const { paneId } = params;

		// Check for pending create
		const pending = this.pendingCreates.get(paneId);
		if (pending) {
			return pending as Promise<{
				isNew: boolean;
				scrollback: string;
				wasRecovered: boolean;
				viewportY?: number;
			}>;
		}

		// Check for existing session
		const existing = this.sessions.get(paneId);
		if (existing && existing.isAlive && this.sshClient.hasChannel(paneId)) {
			existing.lastActive = Date.now();
			return {
				isNew: false,
				scrollback: "",
				wasRecovered: false,
				viewportY: existing.viewportY,
			};
		}

		// Create new session
		const createPromise = this.createSession(params);
		this.pendingCreates.set(paneId, createPromise);

		try {
			const result = await createPromise;
			return result;
		} finally {
			this.pendingCreates.delete(paneId);
		}
	}

	private async createSession(params: {
		paneId: string;
		workspaceId: string;
		cwd?: string;
		cols?: number;
		rows?: number;
		initialCommands?: string[];
	}): Promise<{
		isNew: boolean;
		scrollback: string;
		wasRecovered: boolean;
		viewportY?: number;
	}> {
		const { paneId, workspaceId, cols, rows, initialCommands } = params;
		// Use remote work dir from config, or provided cwd
		const cwd = params.cwd ?? this.config.remoteWorkDir ?? "~";

		// Ensure connected
		if (!this.isConnected()) {
			await this.connect();
		}

		// Create PTY channel
		const channel = await this.sshClient.createPtyChannel({
			paneId,
			cols: cols ?? DEFAULT_COLS,
			rows: rows ?? DEFAULT_ROWS,
			cwd,
		});

		// Set up event listeners (store references for cleanup)
		const dataHandler = (data: string) => {
			this.emit(`data:${paneId}`, data);
			const session = this.sessions.get(paneId);
			if (session) {
				session.lastActive = Date.now();
			}
		};

		const exitHandler = (exitCode: number, signal?: number) => {
			const session = this.sessions.get(paneId);
			if (session) {
				session.isAlive = false;
			}
			this.emit(`exit:${paneId}`, exitCode, signal);
			this.emit("terminalExit", { paneId, exitCode, signal });
			// Clean up handlers on exit
			this.cleanupSessionHandlers(paneId);
		};

		const errorHandler = (error: string) => {
			this.emit(`error:${paneId}`, error);
		};

		// Store handlers for later cleanup
		this.sessionHandlers.set(paneId, { data: dataHandler, exit: exitHandler, error: errorHandler });

		this.sshClient.on(`data:${paneId}`, dataHandler);
		this.sshClient.on(`exit:${paneId}`, exitHandler);
		this.sshClient.on(`error:${paneId}`, errorHandler);

		// Create session record
		const session: SSHSession = {
			paneId,
			workspaceId,
			cwd,
			cols: cols ?? DEFAULT_COLS,
			rows: rows ?? DEFAULT_ROWS,
			lastActive: Date.now(),
			isAlive: true,
		};
		this.sessions.set(paneId, session);

		// Run initial commands if any
		if (initialCommands && initialCommands.length > 0) {
			for (const cmd of initialCommands) {
				channel.write(`${cmd}\n`);
			}
		}

		return {
			isNew: true,
			scrollback: "",
			wasRecovered: false,
		};
	}

	/**
	 * Write data to terminal
	 */
	write(params: { paneId: string; data: string }): void {
		this.sshClient.write(params.paneId, params.data);
	}

	/**
	 * Resize terminal
	 */
	resize(params: { paneId: string; cols: number; rows: number }): void {
		const { paneId, cols, rows } = params;
		this.sshClient.resize(paneId, cols, rows);

		const session = this.sessions.get(paneId);
		if (session) {
			session.cols = cols;
			session.rows = rows;
		}
	}

	/**
	 * Send signal to terminal
	 */
	signal(params: { paneId: string; signal?: string }): void {
		const { paneId, signal } = params;
		if (signal) {
			this.sshClient.signal(paneId, signal);
		}
	}

	/**
	 * Kill terminal session
	 */
	async kill(params: { paneId: string }): Promise<void> {
		const { paneId } = params;
		this.cleanupSessionHandlers(paneId);
		this.sshClient.killChannel(paneId);
		this.sessions.delete(paneId);
	}

	/**
	 * Detach from terminal (save scroll position)
	 */
	detach(params: { paneId: string; viewportY?: number }): void {
		const session = this.sessions.get(params.paneId);
		if (session) {
			session.viewportY = params.viewportY;
		}
	}

	/**
	 * Clear scrollback buffer
	 */
	clearScrollback(_params: { paneId: string }): void {
		// SSH sessions don't maintain local scrollback
		// This is handled by xterm.js in the renderer
	}

	/**
	 * Acknowledge cold restore (no-op for SSH)
	 */
	ackColdRestore(_paneId: string): void {
		// SSH sessions don't support cold restore
	}

	/**
	 * Get session info
	 */
	getSession(
		paneId: string,
	): { isAlive: boolean; cwd: string; lastActive: number } | null {
		const session = this.sessions.get(paneId);
		if (!session) {
			return null;
		}
		return {
			isAlive: session.isAlive,
			cwd: session.cwd,
			lastActive: session.lastActive,
		};
	}

	/**
	 * Kill all sessions for a workspace
	 */
	async killByWorkspaceId(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		let killed = 0;
		let failed = 0;

		for (const [paneId, session] of this.sessions) {
			if (session.workspaceId === workspaceId) {
				try {
					this.cleanupSessionHandlers(paneId);
					this.sshClient.killChannel(paneId);
					this.sessions.delete(paneId);
					killed++;
				} catch (error) {
					console.error(`[ssh/terminal-manager] Failed to kill SSH channel`, {
						paneId,
						workspaceId,
						error: error instanceof Error ? error.message : String(error),
					});
					failed++;
				}
			}
		}

		return { killed, failed };
	}

	/**
	 * Get session count for workspace
	 */
	async getSessionCountByWorkspaceId(workspaceId: string): Promise<number> {
		let count = 0;
		for (const session of this.sessions.values()) {
			if (session.workspaceId === workspaceId && session.isAlive) {
				count++;
			}
		}
		return count;
	}

	/**
	 * Refresh prompts for all terminals in a workspace
	 */
	refreshPromptsForWorkspace(workspaceId: string): void {
		for (const [paneId, session] of this.sessions) {
			if (session.workspaceId === workspaceId && session.isAlive) {
				this.sshClient.write(paneId, "\n");
			}
		}
	}

	/**
	 * Get all sessions info
	 */
	getAllSessions(): SSHSessionInfo[] {
		return Array.from(this.sessions.values()).map((s) => ({
			paneId: s.paneId,
			workspaceId: s.workspaceId,
			cwd: s.cwd,
			isAlive: s.isAlive,
			lastActive: s.lastActive,
		}));
	}

	/**
	 * Cleanup on app quit
	 */
	async cleanup(): Promise<void> {
		// Kill all sessions
		for (const paneId of this.sessions.keys()) {
			this.sshClient.killChannel(paneId);
		}
		this.sessions.clear();

		// Disconnect SSH
		this.disconnect();
	}

	/**
	 * Remove all terminal event listeners
	 */
	detachAllListeners(): void {
		for (const paneId of this.sessions.keys()) {
			this.removeAllListeners(`data:${paneId}`);
			this.removeAllListeners(`exit:${paneId}`);
			this.removeAllListeners(`error:${paneId}`);
		}
	}
}
