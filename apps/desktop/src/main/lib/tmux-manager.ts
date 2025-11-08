import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import type { BrowserWindow } from "electron";
import { app } from "electron";
import * as pty from "node-pty";

/**
 * Persisted session metadata for reattachment after main-process restarts
 */
interface TmuxSessionMetadata {
	sid: string;
	cwd: string;
	lastCols: number;
	lastRows: number;
}

/**
 * Active session tracking
 */
interface ActiveSession {
	pty: pty.IPty | null; // null when detached
	lastResizeSeq: number;
	metadata: TmuxSessionMetadata;
	outputHistory: string;
}

class TmuxManager {
	private static instance: TmuxManager;
	private sessions: Map<string, ActiveSession>;
	private mainWindow: BrowserWindow | null = null;
	private sessionRegistryPath: string;
	// tmux socket name - unique per user
	private readonly TMUX_SOCKET = "onlook";

	private constructor() {
		this.sessions = new Map();
		// Store session registry in app userData directory
		this.sessionRegistryPath = join(
			app.getPath("userData"),
			"tmux-sessions.json",
		);
	}

	static getInstance(): TmuxManager {
		if (!TmuxManager.instance) {
			TmuxManager.instance = new TmuxManager();
		}
		return TmuxManager.instance;
	}

	setMainWindow(window: BrowserWindow | null): void {
		this.mainWindow = window;
	}

	/**
	 * Initialize tmux session manager - restore sessions from disk
	 */
	async initialize(): Promise<void> {
		console.log("[TmuxManager] Initializing...");
		const savedSessions = this.loadSessionsFromDisk();
		console.log(
			`[TmuxManager] Found ${savedSessions.length} persisted sessions`,
		);

		// Verify each session exists in tmux and prepare for lazy reattach
		for (const metadata of savedSessions) {
			this.ensureSessionExists(
				metadata.sid,
				metadata.lastCols,
				metadata.lastRows,
				metadata.cwd,
			);

			// Add to active sessions map (detached state)
			this.sessions.set(metadata.sid, {
				pty: null,
				lastResizeSeq: 0,
				metadata,
				outputHistory: "",
			});
		}
	}

	/**
	 * Bootstrap or verify a tmux session exists with proper configuration
	 */
	private ensureSessionExists(
		sid: string,
		cols: number,
		rows: number,
		cwd?: string,
	): void {
		// Check if session exists
		const hasSession = spawnSync("tmux", [
			"-f",
			"/dev/null",
			"-L",
			this.TMUX_SOCKET,
			"has-session",
			"-t",
			sid,
		]);

		if (hasSession.status !== 0) {
			// Session doesn't exist, create it
			console.log(
				`[TmuxManager] Creating new tmux session: ${sid} (${cols}x${rows})`,
			);

			const shell = process.env.SHELL || "/bin/bash";
			const createResult = spawnSync(
				"tmux",
				[
					"-f",
					"/dev/null",
					"-L",
					this.TMUX_SOCKET,
					"new-session",
					"-Ad",
					"-s",
					sid,
					"-x",
					String(cols),
					"-y",
					String(rows),
					`${shell} -l`,
				],
				{
					cwd: cwd || process.env.HOME || process.cwd(),
				},
			);

			if (createResult.status !== 0) {
				console.error(
					`[TmuxManager] Failed to create session ${sid}:`,
					createResult.stderr.toString(),
				);
				throw new Error(`Failed to create tmux session: ${sid}`);
			}

			// Apply invisibility settings
			this.applySessionSettings(sid);
		} else {
			console.log(`[TmuxManager] Session ${sid} already exists, reusing`);
		}
	}

	/**
	 * Apply tmux settings to make session invisible and optimized
	 */
	private applySessionSettings(sid: string): void {
		const settings = [
			["status", "off"],
			["set-titles", "off"],
			["allow-rename", "off"],
			["mouse", "off"],
			["focus-events", "on"],
			["history-limit", "200000"],
			["remain-on-exit", "off"],
			["detach-on-destroy", "off"],
			["escape-time", "0"],
			["default-terminal", "xterm-256color"],
		];

		for (const [option, value] of settings) {
			spawnSync("tmux", [
				"-L",
				this.TMUX_SOCKET,
				"set",
				"-t",
				sid,
				option,
				value,
			]);
		}

		// Add terminal-overrides for true color support
		spawnSync("tmux", [
			"-L",
			this.TMUX_SOCKET,
			"set",
			"-t",
			sid,
			"-as",
			"terminal-overrides",
			",*:Tc",
		]);
	}

	/**
	 * Create or reattach to a terminal session
	 */
	async create(options?: {
		id?: string;
		cwd?: string;
		cols?: number;
		rows?: number;
	}): Promise<string> {
		try {
			const sid = options?.id || randomUUID();
			const cols = options?.cols || 80;
			const rows = options?.rows || 30;

			// Validate cwd
			let workingDir = options?.cwd;
			if (workingDir && !existsSync(workingDir)) {
				console.warn(
					`[TmuxManager] Working directory does not exist: ${workingDir}, falling back`,
				);
				workingDir = undefined;
			}
			const finalCwd = workingDir || process.env.HOME || process.cwd();

			// Check if session already attached
			if (this.sessions.has(sid)) {
				const session = this.sessions.get(sid)!;
				if (session.pty) {
					// Already attached, just return
					console.log(`[TmuxManager] Session ${sid} already attached`);
					return sid;
				}
				// Session exists but detached, reattach below
			}

			// Ensure tmux session exists
			this.ensureSessionExists(sid, cols, rows, finalCwd);

			// Resize the tmux window BEFORE attaching to ensure proper dimensions
			// This is crucial for reconnection after restart
			console.log(
				`[TmuxManager] Resizing tmux window ${sid} to ${cols}x${rows} before attach`,
			);
			const resizeResult = spawnSync("tmux", [
				"-L",
				this.TMUX_SOCKET,
				"resize-window",
				"-t",
				sid,
				"-x",
				String(cols),
				"-y",
				String(rows),
			]);

			if (resizeResult.status !== 0) {
				console.warn(
					`[TmuxManager] Failed to pre-resize tmux window ${sid}:`,
					resizeResult.stderr.toString(),
				);
			}

			// Force tmux to refresh and reflow content at new size
			// This ensures the pane content is properly wrapped for the new dimensions
			spawnSync("tmux", ["-L", this.TMUX_SOCKET, "refresh-client", "-t", sid]);

			// Attach to the session via node-pty
			console.log(`[TmuxManager] Attaching to session: ${sid}`);
			const ptyProcess = pty.spawn(
				"tmux",
				[
					"-f",
					"/dev/null",
					"-L",
					this.TMUX_SOCKET,
					"attach-session",
					"-t",
					sid,
				],
				{
					name: "xterm-256color",
					cols,
					rows,
					cwd: finalCwd,
					env: {
						...(process.env as Record<string, string>),
						TERM: "xterm-256color",
						COLORTERM: "truecolor",
					},
				},
			);

			// Set up data listener
			ptyProcess.onData((data: string) => {
				this.addTerminalMessage(sid, data);
			});

			// Handle exit (PTY client detached, not tmux session killed)
			ptyProcess.onExit(({ exitCode }) => {
				console.log(`[TmuxManager] PTY client for ${sid} exited: ${exitCode}`);
				const session = this.sessions.get(sid);
				if (session) {
					// Mark as detached but keep session metadata
					session.pty = null;
				}
			});

			// Store or update session
			if (this.sessions.has(sid)) {
				const session = this.sessions.get(sid)!;
				session.pty = ptyProcess;
				session.metadata.lastCols = cols;
				session.metadata.lastRows = rows;
				session.metadata.cwd = finalCwd;
			} else {
				this.sessions.set(sid, {
					pty: ptyProcess,
					lastResizeSeq: 0,
					metadata: {
						sid,
						cwd: finalCwd,
						lastCols: cols,
						lastRows: rows,
					},
					outputHistory: "",
				});
			}

			// Persist session registry
			this.saveSessionsToDisk();

			return sid;
		} catch (error) {
			console.error("[TmuxManager] Failed to create/attach terminal:", error);
			throw error;
		}
	}

	/**
	 * Handle resize with sequence tracking to prevent out-of-order resizes
	 */
	resize(sid: string, cols: number, rows: number, seq: number): boolean {
		try {
			const session = this.sessions.get(sid);
			if (!session) {
				console.warn(`[TmuxManager] Resize failed: session ${sid} not found`);
				return false;
			}

			// Drop stale resize events
			if (seq <= session.lastResizeSeq) {
				console.log(
					`[TmuxManager] Dropping stale resize for ${sid}: seq ${seq} <= ${session.lastResizeSeq}`,
				);
				return false;
			}

			session.lastResizeSeq = seq;
			session.metadata.lastCols = cols;
			session.metadata.lastRows = rows;

			// Resize PTY client if attached
			if (session.pty) {
				session.pty.resize(cols, rows);
			}

			// Resize tmux window
			const result = spawnSync("tmux", [
				"-L",
				this.TMUX_SOCKET,
				"resize-window",
				"-t",
				sid,
				"-x",
				String(cols),
				"-y",
				String(rows),
			]);

			if (result.status !== 0) {
				console.error(
					`[TmuxManager] Failed to resize tmux window ${sid}:`,
					result.stderr.toString(),
				);
				return false;
			}

			// Update persisted metadata
			this.saveSessionsToDisk();

			return true;
		} catch (error) {
			console.error(`[TmuxManager] Failed to resize terminal ${sid}:`, error);
			return false;
		}
	}

	/**
	 * Send signal to foreground process in tmux session
	 */
	signal(sid: string, signal: string): boolean {
		try {
			const session = this.sessions.get(sid);
			if (!session) {
				console.warn(`[TmuxManager] Signal failed: session ${sid} not found`);
				return false;
			}

			// Use tmux run-shell to target the foreground process group
			const result = spawnSync("tmux", [
				"-L",
				this.TMUX_SOCKET,
				"run-shell",
				`kill -s ${signal} -$(tmux display -p "#{pane_pid}")`,
			]);

			if (result.status !== 0) {
				console.error(
					`[TmuxManager] Failed to send signal ${signal} to ${sid}:`,
					result.stderr.toString(),
				);
				// Fallback: send to PTY process if attached
				if (session.pty) {
					session.pty.kill(signal);
				}
				return false;
			}

			return true;
		} catch (error) {
			console.error(
				`[TmuxManager] Failed to send signal ${signal} to ${sid}:`,
				error,
			);
			return false;
		}
	}

	/**
	 * Write data to terminal
	 */
	write(sid: string, data: string): boolean {
		try {
			const session = this.sessions.get(sid);
			if (session?.pty) {
				// Debug: log what's being written
				session.pty.write(data);
				return true;
			}
			console.warn(`[TmuxManager] Write failed: session ${sid} not attached`);
			return false;
		} catch (error) {
			console.error(`[TmuxManager] Failed to write to terminal ${sid}:`, error);
			return false;
		}
	}

	/**
	 * Execute command (convenience wrapper)
	 */
	executeCommand(sid: string, command: string): boolean {
		try {
			const newline = os.platform() === "win32" ? "\r\n" : "\n";
			return this.write(sid, command + newline);
		} catch (error) {
			console.error(
				`[TmuxManager] Failed to execute command in ${sid}:`,
				error,
			);
			return false;
		}
	}

	/**
	 * Detach from session (kill PTY client, keep tmux session alive)
	 */
	detach(sid: string): boolean {
		try {
			const session = this.sessions.get(sid);
			if (session?.pty) {
				console.log(`[TmuxManager] Detaching from session: ${sid}`);
				session.pty.kill();
				session.pty = null;
				return true;
			}
			return false;
		} catch (error) {
			console.error(`[TmuxManager] Failed to detach from ${sid}:`, error);
			return false;
		}
	}

	/**
	 * Kill tmux session completely
	 */
	kill(sid: string): boolean {
		try {
			console.log(`[TmuxManager] Killing session: ${sid}`);

			// Kill PTY client if attached
			const session = this.sessions.get(sid);
			if (session?.pty) {
				session.pty.kill();
			}

			// Kill tmux session
			const result = spawnSync("tmux", [
				"-L",
				this.TMUX_SOCKET,
				"kill-session",
				"-t",
				sid,
			]);

			if (result.status !== 0) {
				console.error(
					`[TmuxManager] Failed to kill session ${sid}:`,
					result.stderr.toString(),
				);
			}

			// Remove from tracking
			this.sessions.delete(sid);

			// Update persisted registry
			this.saveSessionsToDisk();

			return true;
		} catch (error) {
			console.error(`[TmuxManager] Failed to kill terminal ${sid}:`, error);
			return false;
		}
	}

	/**
	 * Kill all sessions
	 */
	killAll(): boolean {
		try {
			console.log("[TmuxManager] Killing all sessions");
			for (const sid of this.sessions.keys()) {
				this.kill(sid);
			}
			return true;
		} catch (error) {
			console.error("[TmuxManager] Failed to kill all terminals:", error);
			return false;
		}
	}

	/**
	 * Get output history
	 * Returns in-memory history or undefined
	 * Note: After restart, history is empty and will be populated by PTY data on reattach
	 */
	getHistory(sid: string): string | undefined {
		const session = this.sessions.get(sid);
		if (!session) return undefined;

		// Return in-memory history if available
		if (session.outputHistory.length > 0) {
			return session.outputHistory;
		}
		return undefined;
	}

	/**
	 * Add terminal output to history
	 */
	private addTerminalMessage(sid: string, data: string): void {
		const session = this.sessions.get(sid);
		if (session) {
			session.outputHistory += data;
		}
		this.emitMessage(sid, data);
	}

	/**
	 * Emit terminal data to renderer
	 */
	private emitMessage(sid: string, data: string): void {
		this.mainWindow?.webContents.send("terminal-on-data", {
			id: sid,
			data,
		});
	}

	/**
	 * Load persisted sessions from disk
	 */
	private loadSessionsFromDisk(): TmuxSessionMetadata[] {
		try {
			if (!existsSync(this.sessionRegistryPath)) {
				return [];
			}

			const content = readFileSync(this.sessionRegistryPath, "utf-8");
			const data = JSON.parse(content) as TmuxSessionMetadata[];
			return Array.isArray(data) ? data : [];
		} catch (error) {
			console.error("[TmuxManager] Failed to load sessions from disk:", error);
			return [];
		}
	}

	/**
	 * Save sessions to disk for reattachment after restart
	 */
	private saveSessionsToDisk(): void {
		try {
			const metadata: TmuxSessionMetadata[] = [];

			for (const session of this.sessions.values()) {
				metadata.push(session.metadata);
			}

			// Ensure directory exists
			const dir = dirname(this.sessionRegistryPath);
			if (!existsSync(dir)) {
				mkdir(dir, { recursive: true });
			}

			writeFileSync(
				this.sessionRegistryPath,
				JSON.stringify(metadata, null, 2),
				"utf-8",
			);

			console.log(`[TmuxManager] Saved ${metadata.length} sessions to disk`);
		} catch (error) {
			console.error("[TmuxManager] Failed to save sessions to disk:", error);
		}
	}
}

export default TmuxManager.getInstance();
