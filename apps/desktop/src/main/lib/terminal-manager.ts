import { EventEmitter } from "node:events";
import os from "node:os";
import * as pty from "node-pty";

/**
 * Terminal session metadata
 */
interface TerminalSession {
	pty: pty.IPty;
	tabId: string;
	workspaceId: string;
	cwd: string;
	cols: number;
	rows: number;
	lastActive: number;
	scrollback: string[];
	isAlive: boolean;
}

/**
 * Terminal event types
 */
export interface TerminalDataEvent {
	type: "data";
	data: string;
}

export interface TerminalExitEvent {
	type: "exit";
	exitCode: number;
	signal?: number;
}

export type TerminalEvent = TerminalDataEvent | TerminalExitEvent;

/**
 * TerminalManager manages node-pty sessions keyed by tabId
 * Provides create/reuse, write, resize, signal/kill, and detach operations
 */
export class TerminalManager extends EventEmitter {
	private sessions = new Map<string, TerminalSession>();
	private readonly DEFAULT_COLS = 80;
	private readonly DEFAULT_ROWS = 24;

	/**
	 * Create or attach to an existing terminal session
	 */
	createOrAttach(params: {
		tabId: string;
		workspaceId: string;
		cwd?: string;
		cols?: number;
		rows?: number;
	}): {
		isNew: boolean;
		scrollback: string[];
	} {
		const { tabId, workspaceId, cwd, cols, rows } = params;

		// Check if session already exists and is alive
		const existing = this.sessions.get(tabId);
		if (existing?.isAlive) {
			existing.lastActive = Date.now();
			// Update size if provided
			if (cols !== undefined && rows !== undefined) {
				this.resize({ tabId, cols, rows });
			}
			return {
				isNew: false,
				scrollback: existing.scrollback,
			};
		}

		// Create new session
		const shell = os.platform() === "win32" ? "powershell.exe" : "zsh";
		const workingDir = cwd || os.homedir();
		const terminalCols = cols || this.DEFAULT_COLS;
		const terminalRows = rows || this.DEFAULT_ROWS;

		const ptyProcess = pty.spawn(shell, [], {
			name: "xterm-256color",
			cols: terminalCols,
			rows: terminalRows,
			cwd: workingDir,
			env: process.env as Record<string, string>,
		});

		const session: TerminalSession = {
			pty: ptyProcess,
			tabId,
			workspaceId,
			cwd: workingDir,
			cols: terminalCols,
			rows: terminalRows,
			lastActive: Date.now(),
			scrollback: [],
			isAlive: true,
		};

		// Handle pty output
		ptyProcess.onData((data) => {
			// Store in scrollback buffer
			this.addToScrollback(session, data);

			// Emit data event
			this.emit(`data:${tabId}`, data);
		});

		// Handle pty exit
		ptyProcess.onExit(({ exitCode, signal }) => {
			session.isAlive = false;

			// Emit exit event
			this.emit(`exit:${tabId}`, exitCode, signal);

			// Clean up session after a delay (allow reconnection window)
			setTimeout(() => {
				this.sessions.delete(tabId);
			}, 5000);
		});

		this.sessions.set(tabId, session);

		return {
			isNew: true,
			scrollback: [],
		};
	}

	/**
	 * Write data to the terminal
	 */
	write(params: { tabId: string; data: string }): void {
		const { tabId, data } = params;
		const session = this.sessions.get(tabId);

		if (!session || !session.isAlive) {
			throw new Error(`Terminal session ${tabId} not found or not alive`);
		}

		session.pty.write(data);
		session.lastActive = Date.now();
	}

	/**
	 * Resize the terminal
	 */
	resize(params: {
		tabId: string;
		cols: number;
		rows: number;
		seq?: number;
	}): void {
		const { tabId, cols, rows } = params;
		const session = this.sessions.get(tabId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot resize terminal ${tabId}: session not found or not alive`,
			);
			return;
		}

		session.pty.resize(cols, rows);
		session.cols = cols;
		session.rows = rows;
		session.lastActive = Date.now();
	}

	/**
	 * Send signal to the terminal process
	 */
	signal(params: { tabId: string; signal?: string }): void {
		const { tabId, signal = "SIGTERM" } = params;
		const session = this.sessions.get(tabId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot signal terminal ${tabId}: session not found or not alive`,
			);
			return;
		}

		// Send signal to pty process
		session.pty.kill(signal);
		session.lastActive = Date.now();
	}

	/**
	 * Kill the terminal session
	 */
	kill(params: { tabId: string }): void {
		const { tabId } = params;
		const session = this.sessions.get(tabId);

		if (!session) {
			console.warn(`Cannot kill terminal ${tabId}: session not found`);
			return;
		}

		if (session.isAlive) {
			session.pty.kill();
		}

		// Clean up immediately
		this.sessions.delete(tabId);
	}

	/**
	 * Detach from terminal (keep session alive)
	 */
	detach(params: { tabId: string }): void {
		const { tabId } = params;
		const session = this.sessions.get(tabId);

		if (!session) {
			console.warn(`Cannot detach terminal ${tabId}: session not found`);
			return;
		}

		session.lastActive = Date.now();
		// Session stays in the map and keeps running
	}

	/**
	 * Get session metadata
	 */
	getSession(tabId: string): {
		isAlive: boolean;
		cwd: string;
		lastActive: number;
	} | null {
		const session = this.sessions.get(tabId);
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
	 * Clean up all sessions (called on app quit)
	 */
	cleanup(): void {
		for (const [_tabId, session] of this.sessions.entries()) {
			if (session.isAlive) {
				session.pty.kill();
			}
		}
		this.sessions.clear();
		this.removeAllListeners();
	}

	/**
	 * Add data to scrollback buffer
	 * Stores raw terminal output (with ANSI codes) as a single string
	 */
	private addToScrollback(session: TerminalSession, data: string): void {
		// Append to scrollback as raw data (preserves ANSI escape sequences)
		if (session.scrollback.length === 0) {
			session.scrollback.push(data);
		} else {
			session.scrollback[0] += data;
		}

		// Trim scrollback if it exceeds max character count (not line count)
		const MAX_CHARS = 50000; // ~50KB of history
		if (session.scrollback[0].length > MAX_CHARS) {
			// Keep last MAX_CHARS characters
			session.scrollback[0] = session.scrollback[0].slice(-MAX_CHARS);
		}
	}
}

// Singleton instance
export const terminalManager = new TerminalManager();
