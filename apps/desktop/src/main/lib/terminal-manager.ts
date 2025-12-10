import { EventEmitter } from "node:events";
import os from "node:os";
import * as pty from "node-pty";
import { PORTS } from "shared/constants";
import { getShellArgs, getShellEnv } from "./agent-setup";
import {
	containsClearScrollbackSequence,
	TerminalEscapeFilter,
} from "./terminal-escape-filter";
import { HistoryReader, HistoryWriter } from "./terminal-history";

interface TerminalSession {
	pty: pty.IPty;
	paneId: string;
	workspaceId: string;
	cwd: string;
	cols: number;
	rows: number;
	lastActive: number;
	scrollback: string;
	isAlive: boolean;
	deleteHistoryOnExit?: boolean;
	wasRecovered: boolean;
	historyWriter?: HistoryWriter;
	escapeFilter: TerminalEscapeFilter;
}

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

export class TerminalManager extends EventEmitter {
	private sessions = new Map<string, TerminalSession>();
	private pendingSessions = new Map<
		string,
		Promise<{ isNew: boolean; scrollback: string; wasRecovered: boolean }>
	>();
	private readonly DEFAULT_COLS = 80;
	private readonly DEFAULT_ROWS = 24;

	async createOrAttach(params: {
		paneId: string;
		tabId: string;
		workspaceId: string;
		cwd?: string;
		cols?: number;
		rows?: number;
		initialCommands?: string[];
	}): Promise<{
		isNew: boolean;
		scrollback: string;
		wasRecovered: boolean;
	}> {
		const { paneId, tabId, workspaceId, cwd, cols, rows, initialCommands } =
			params;

		// Deduplicate concurrent calls for the same paneId (prevents race in React Strict Mode)
		const pending = this.pendingSessions.get(paneId);
		if (pending) {
			return pending;
		}

		const existing = this.sessions.get(paneId);
		if (existing?.isAlive) {
			existing.lastActive = Date.now();
			if (cols !== undefined && rows !== undefined) {
				this.resize({ paneId, cols, rows });
			}
			return {
				isNew: false,
				scrollback: existing.scrollback,
				wasRecovered: existing.wasRecovered,
			};
		}

		// Track this creation to prevent duplicate sessions from concurrent calls
		const creationPromise = this.doCreateSession({
			paneId,
			tabId,
			workspaceId,
			cwd,
			cols,
			rows,
			initialCommands,
			existingScrollback: existing?.scrollback || null,
		});
		this.pendingSessions.set(paneId, creationPromise);

		try {
			return await creationPromise;
		} finally {
			this.pendingSessions.delete(paneId);
		}
	}

	private async doCreateSession(params: {
		paneId: string;
		tabId: string;
		workspaceId: string;
		cwd?: string;
		cols?: number;
		rows?: number;
		initialCommands?: string[];
		existingScrollback: string | null;
	}): Promise<{
		isNew: boolean;
		scrollback: string;
		wasRecovered: boolean;
	}> {
		const {
			paneId,
			tabId,
			workspaceId,
			cwd,
			cols,
			rows,
			initialCommands,
			existingScrollback,
		} = params;

		const shell = this.getDefaultShell();
		const workingDir = cwd || os.homedir();
		const terminalCols = cols || this.DEFAULT_COLS;
		const terminalRows = rows || this.DEFAULT_ROWS;

		const baseEnv = this.sanitizeEnv(process.env) || {};
		const shellEnv = getShellEnv(shell);
		const env = {
			...baseEnv,
			...shellEnv,
			SUPERSET_PANE_ID: paneId,
			SUPERSET_TAB_ID: tabId,
			SUPERSET_WORKSPACE_ID: workspaceId,
			SUPERSET_PORT: String(PORTS.NOTIFICATIONS),
		};

		// Recover scrollback from in-memory dead session or disk
		let recoveredScrollback = "";
		let wasRecovered = false;
		if (existingScrollback) {
			recoveredScrollback = existingScrollback;
			wasRecovered = true;
		} else {
			const historyReader = new HistoryReader(workspaceId, paneId);
			const history = await historyReader.read();
			if (history.scrollback) {
				recoveredScrollback = history.scrollback;
				wasRecovered = true;
			}
		}

		if (recoveredScrollback) {
			// Strip protocol responses from recovered history so replays stay clean
			const recoveryFilter = new TerminalEscapeFilter();
			recoveredScrollback =
				recoveryFilter.filter(recoveredScrollback) + recoveryFilter.flush();
		}

		const shellArgs = getShellArgs(shell);

		const ptyProcess = pty.spawn(shell, shellArgs, {
			name: "xterm-256color",
			cols: terminalCols,
			rows: terminalRows,
			cwd: workingDir,
			env,
		});

		// Initialize history writer with recovered scrollback
		const historyWriter = new HistoryWriter(
			workspaceId,
			paneId,
			workingDir,
			terminalCols,
			terminalRows,
		);
		await historyWriter.init(recoveredScrollback || undefined);

		const session: TerminalSession = {
			pty: ptyProcess,
			paneId,
			workspaceId,
			cwd: workingDir,
			cols: terminalCols,
			rows: terminalRows,
			lastActive: Date.now(),
			scrollback: recoveredScrollback,
			isAlive: true,
			wasRecovered,
			historyWriter,
			escapeFilter: new TerminalEscapeFilter(),
		};

		// Send initial commands after first shell output (shell is ready)
		const shouldRunCommands =
			!wasRecovered && initialCommands && initialCommands.length > 0;
		let commandsSent = false;

		ptyProcess.onData((data) => {
			if (containsClearScrollbackSequence(data)) {
				session.scrollback = "";
				session.escapeFilter = new TerminalEscapeFilter();
				this.reinitializeHistory(session).catch(() => {});
			}

			// Filter query responses for storage; xterm receives raw data for proper protocol handling
			const filteredData = session.escapeFilter.filter(data);
			session.scrollback += filteredData;
			session.historyWriter?.write(filteredData);
			// Emit ORIGINAL data to xterm - it needs to process query responses
			this.emit(`data:${paneId}`, data);

			if (shouldRunCommands && !commandsSent) {
				commandsSent = true;
				setTimeout(() => {
					if (session.isAlive) {
						const cmdString = `${initialCommands.join(" && ")}\n`;
						session.pty.write(cmdString);
					}
				}, 100);
			}
		});

		ptyProcess.onExit(async ({ exitCode, signal }) => {
			session.isAlive = false;

			// Flush any buffered data from the escape filter
			const remaining = session.escapeFilter.flush();
			if (remaining) {
				session.scrollback += remaining;
				session.historyWriter?.write(remaining);
			}

			await this.closeHistory(session, exitCode);
			this.emit(`exit:${paneId}`, exitCode, signal);

			const timeout = setTimeout(() => {
				this.sessions.delete(paneId);
			}, 5000);
			timeout.unref();
		});

		this.sessions.set(paneId, session);

		return {
			isNew: true,
			scrollback: session.scrollback,
			wasRecovered,
		};
	}

	write(params: { paneId: string; data: string }): void {
		const { paneId, data } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			throw new Error(`Terminal session ${paneId} not found or not alive`);
		}

		session.pty.write(data);
		session.lastActive = Date.now();
	}

	resize(params: {
		paneId: string;
		cols: number;
		rows: number;
		seq?: number;
	}): void {
		const { paneId, cols, rows } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot resize terminal ${paneId}: session not found or not alive`,
			);
			return;
		}

		session.pty.resize(cols, rows);
		session.cols = cols;
		session.rows = rows;
		session.lastActive = Date.now();
	}

	signal(params: { paneId: string; signal?: string }): void {
		const { paneId, signal = "SIGTERM" } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot signal terminal ${paneId}: session not found or not alive`,
			);
			return;
		}

		session.pty.kill(signal);
		session.lastActive = Date.now();
	}

	async kill(params: {
		paneId: string;
		deleteHistory?: boolean;
	}): Promise<void> {
		const { paneId, deleteHistory = false } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(`Cannot kill terminal ${paneId}: session not found`);
			return;
		}

		if (deleteHistory) {
			session.deleteHistoryOnExit = true;
		}

		if (session.isAlive) {
			session.pty.kill();
		} else {
			await this.closeHistory(session);
			this.sessions.delete(paneId);
		}
	}

	detach(params: { paneId: string }): void {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(`Cannot detach terminal ${paneId}: session not found`);
			return;
		}

		session.lastActive = Date.now();
	}

	async clearScrollback(params: { paneId: string }): Promise<void> {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(
				`Cannot clear scrollback for terminal ${paneId}: session not found`,
			);
			return;
		}

		session.scrollback = "";
		session.escapeFilter = new TerminalEscapeFilter();
		await this.reinitializeHistory(session);
		session.lastActive = Date.now();
	}

	private async reinitializeHistory(session: TerminalSession): Promise<void> {
		if (session.historyWriter) {
			await session.historyWriter.close();
			session.historyWriter = new HistoryWriter(
				session.workspaceId,
				session.paneId,
				session.cwd,
				session.cols,
				session.rows,
			);
			await session.historyWriter.init();
		}
	}

	getSession(paneId: string): {
		isAlive: boolean;
		cwd: string;
		lastActive: number;
	} | null {
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

	async killByWorkspaceId(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		const sessionsToKill = Array.from(this.sessions.entries()).filter(
			([, session]) => session.workspaceId === workspaceId,
		);

		if (sessionsToKill.length === 0) {
			return { killed: 0, failed: 0 };
		}

		const results: Promise<boolean>[] = [];

		for (const [paneId, session] of sessionsToKill) {
			if (session.isAlive) {
				session.deleteHistoryOnExit = true;

				const killPromise = new Promise<boolean>((resolve) => {
					let resolved = false;
					let sigtermTimeout: ReturnType<typeof setTimeout> | undefined;
					let sigkillTimeout: ReturnType<typeof setTimeout> | undefined;

					const cleanup = (success: boolean) => {
						if (resolved) return;
						resolved = true;
						this.off(`exit:${paneId}`, exitHandler);
						if (sigtermTimeout) clearTimeout(sigtermTimeout);
						if (sigkillTimeout) clearTimeout(sigkillTimeout);
						resolve(success);
					};

					const exitHandler = () => cleanup(true);
					this.once(`exit:${paneId}`, exitHandler);

					// First timeout: SIGTERM didn't work, try SIGKILL
					sigtermTimeout = setTimeout(() => {
						if (resolved || !session.isAlive) return;

						try {
							session.pty.kill("SIGKILL");
						} catch (error) {
							console.error(
								`Failed to send SIGKILL to terminal ${paneId}:`,
								error,
							);
						}

						// Second timeout: SIGKILL didn't work either
						sigkillTimeout = setTimeout(() => {
							if (resolved) return;

							if (session.isAlive) {
								console.error(
									`Terminal ${paneId} did not exit after SIGKILL, forcing cleanup. Process may still be running.`,
								);
								// Clean up session state before resolving
								session.isAlive = false;
								this.sessions.delete(paneId);
								this.closeHistory(session).catch(() => {});
							}
							cleanup(false);
						}, 500);
						sigkillTimeout.unref();
					}, 2000);
					sigtermTimeout.unref();

					// Send initial SIGTERM
					try {
						session.pty.kill();
					} catch (error) {
						console.error(
							`Failed to send SIGTERM to terminal ${paneId}:`,
							error,
						);
						// Mark as failed immediately since we can't even signal it
						session.isAlive = false;
						this.sessions.delete(paneId);
						this.closeHistory(session).catch(() => {});
						cleanup(false);
					}
				});

				results.push(killPromise);
			} else {
				// Clean up history for already-dead sessions
				session.deleteHistoryOnExit = true;
				await this.closeHistory(session);
				this.sessions.delete(paneId);
				results.push(Promise.resolve(true));
			}
		}

		const outcomes = await Promise.all(results);
		const killed = outcomes.filter(Boolean).length;
		const failed = outcomes.length - killed;

		return { killed, failed };
	}

	getSessionCountByWorkspaceId(workspaceId: string): number {
		return Array.from(this.sessions.values()).filter(
			(session) => session.workspaceId === workspaceId && session.isAlive,
		).length;
	}

	/**
	 * Remove terminal stream subscription listeners without killing terminals.
	 * Used when window closes on macOS to prevent duplicate listeners
	 * when window reopens.
	 *
	 * Only removes data:* and exit:* listeners (from tRPC subscriptions),
	 * preserving any other listeners that may be registered.
	 *
	 * Note: On app quit, cleanup() has its own timeout fallback if
	 * listeners are removed early.
	 */
	detachAllListeners(): void {
		const eventNames = this.eventNames();
		for (const event of eventNames) {
			const name = String(event);
			if (name.startsWith("data:") || name.startsWith("exit:")) {
				this.removeAllListeners(event);
			}
		}
	}

	async cleanup(): Promise<void> {
		const exitPromises: Promise<void>[] = [];

		for (const [paneId, session] of this.sessions.entries()) {
			if (session.isAlive) {
				const exitPromise = new Promise<void>((resolve) => {
					const exitHandler = () => {
						this.off(`exit:${paneId}`, exitHandler);
						if (timeoutId) {
							clearTimeout(timeoutId);
						}
						resolve();
					};
					this.once(`exit:${paneId}`, exitHandler);

					const timeoutId = setTimeout(() => {
						this.off(`exit:${paneId}`, exitHandler);
						resolve();
					}, 2000);
					timeoutId.unref();
				});

				exitPromises.push(exitPromise);
				session.pty.kill();
			} else {
				await this.closeHistory(session);
			}
		}

		await Promise.all(exitPromises);

		this.sessions.clear();
		this.removeAllListeners();
	}

	private async closeHistory(
		session: TerminalSession,
		exitCode?: number,
	): Promise<void> {
		if (session.deleteHistoryOnExit) {
			// Close stream first, then cleanup
			if (session.historyWriter) {
				await session.historyWriter.close();
				session.historyWriter = undefined;
			}
			const historyReader = new HistoryReader(
				session.workspaceId,
				session.paneId,
			);
			await historyReader.cleanup();
			return;
		}

		if (session.historyWriter) {
			await session.historyWriter.close(exitCode);
			session.historyWriter = undefined;
		}
	}

	private getDefaultShell(): string {
		const platform = os.platform();

		if (platform === "win32") {
			return process.env.COMSPEC || "powershell.exe";
		}

		if (process.env.SHELL) {
			return process.env.SHELL;
		}

		const commonShells = ["/bin/bash", "/bin/zsh", "/bin/sh"];
		const fs = require("node:fs");

		for (const shell of commonShells) {
			try {
				if (fs.existsSync(shell)) {
					return shell;
				}
			} catch {
				// Shell not available, try next
			}
		}

		return "/bin/sh";
	}

	private sanitizeEnv(
		env: NodeJS.ProcessEnv,
	): Record<string, string> | undefined {
		const sanitized: Record<string, string> = {};

		for (const [key, value] of Object.entries(env)) {
			if (typeof value === "string") {
				sanitized[key] = value;
			}
		}

		return Object.keys(sanitized).length > 0 ? sanitized : undefined;
	}
}

export const terminalManager = new TerminalManager();
