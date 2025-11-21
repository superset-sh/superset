import { EventEmitter } from "node:events";
import os from "node:os";
import * as pty from "node-pty";
import { HistoryReader, HistoryWriter } from "./terminal-history";

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
	historyWriter?: HistoryWriter;
	deleteHistoryOnExit?: boolean;
	wasRecovered: boolean;
	historyFinalized?: boolean;
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
	private readonly DEFAULT_COLS = 80;
	private readonly DEFAULT_ROWS = 24;

	async createOrAttach(params: {
		tabId: string;
		workspaceId: string;
		cwd?: string;
		cols?: number;
		rows?: number;
	}): Promise<{
		isNew: boolean;
		scrollback: string[];
		wasRecovered: boolean;
	}> {
		const { tabId, workspaceId, cwd, cols, rows } = params;

		const existing = this.sessions.get(tabId);
		if (existing?.isAlive) {
			existing.lastActive = Date.now();
			if (cols !== undefined && rows !== undefined) {
				this.resize({ tabId, cols, rows });
			}
			return {
				isNew: false,
				scrollback: existing.scrollback,
				wasRecovered: existing.wasRecovered,
			};
		}

		const shell = this.getDefaultShell();
		const workingDir = cwd || os.homedir();
		const terminalCols = cols || this.DEFAULT_COLS;
		const terminalRows = rows || this.DEFAULT_ROWS;

		const historyReader = new HistoryReader(workspaceId, tabId);
		const recovery = await historyReader.getLatestSession();

		const ptyProcess = pty.spawn(shell, [], {
			name: "xterm-256color",
			cols: terminalCols,
			rows: terminalRows,
			cwd: workingDir,
			env: this.sanitizeEnv(process.env),
		});

		const historyWriter = new HistoryWriter(
			workspaceId,
			tabId,
			workingDir,
			terminalCols,
			terminalRows,
		);
		await historyWriter.init();

		const session: TerminalSession = {
			pty: ptyProcess,
			tabId,
			workspaceId,
			cwd: workingDir,
			cols: terminalCols,
			rows: terminalRows,
			lastActive: Date.now(),
			scrollback:
				recovery.wasRecovered && recovery.scrollback
					? [recovery.scrollback]
					: [],
			isAlive: true,
			historyWriter,
			wasRecovered: recovery.wasRecovered,
			historyFinalized: false,
		};

		ptyProcess.onData((data) => {
			this.addToScrollback(session, data);
			if (session.historyWriter) {
				session.historyWriter.writeData(data);
			}
			this.emit(`data:${tabId}`, data);
		});

		ptyProcess.onExit(async ({ exitCode, signal }) => {
			session.isAlive = false;

			await this.finalizeHistory(session, {
				exitCode,
				signal,
				cleanupDir: session.deleteHistoryOnExit ?? false,
			});

			this.emit(`exit:${tabId}`, exitCode, signal);

			// Allow reconnection window before cleanup
			const timeout = setTimeout(() => {
				this.sessions.delete(tabId);
			}, 5000);
			timeout.unref();
		});

		this.sessions.set(tabId, session);

		return {
			isNew: true,
			scrollback:
				recovery.wasRecovered && recovery.scrollback
					? [recovery.scrollback]
					: [],
			wasRecovered: recovery.wasRecovered,
		};
	}

	write(params: { tabId: string; data: string }): void {
		const { tabId, data } = params;
		const session = this.sessions.get(tabId);

		if (!session || !session.isAlive) {
			throw new Error(`Terminal session ${tabId} not found or not alive`);
		}

		session.pty.write(data);
		session.lastActive = Date.now();
	}

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

	signal(params: { tabId: string; signal?: string }): void {
		const { tabId, signal = "SIGTERM" } = params;
		const session = this.sessions.get(tabId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot signal terminal ${tabId}: session not found or not alive`,
			);
			return;
		}

		session.pty.kill(signal);
		session.lastActive = Date.now();
	}

	async kill(params: {
		tabId: string;
		deleteHistory?: boolean;
	}): Promise<void> {
		const { tabId, deleteHistory = false } = params;
		const session = this.sessions.get(tabId);

		if (!session) {
			console.warn(`Cannot kill terminal ${tabId}: session not found`);
			return;
		}

		if (deleteHistory) {
			session.deleteHistoryOnExit = true;
		}

		if (session.isAlive) {
			session.pty.kill();
		} else {
			// If already dead, finalize and cleanup immediately since exit handler won't run
			await this.finalizeHistory(session, {
				exitCode: undefined,
				signal: undefined,
				cleanupDir: deleteHistory,
			});
			this.sessions.delete(tabId);
		}
	}

	detach(params: { tabId: string }): void {
		const { tabId } = params;
		const session = this.sessions.get(tabId);

		if (!session) {
			console.warn(`Cannot detach terminal ${tabId}: session not found`);
			return;
		}

		session.lastActive = Date.now();
	}

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

	async cleanup(): Promise<void> {
		const exitPromises: Promise<void>[] = [];

		for (const [tabId, session] of this.sessions.entries()) {
			if (session.isAlive) {
				const exitPromise = new Promise<void>((resolve) => {
					const exitHandler = () => {
						this.off(`exit:${tabId}`, exitHandler);
						if (timeoutId) {
							clearTimeout(timeoutId);
						}
						resolve();
					};
					this.once(`exit:${tabId}`, exitHandler);

					// Set timeout to avoid hanging indefinitely
					const timeoutId = setTimeout(() => {
						this.off(`exit:${tabId}`, exitHandler);
						resolve();
					}, 2000);
					timeoutId.unref();
				});

				exitPromises.push(exitPromise);
				session.pty.kill();
			} else {
				await this.finalizeHistory(session, {
					exitCode: undefined,
					signal: undefined,
					cleanupDir: session.deleteHistoryOnExit ?? false,
				});
			}
		}

		await Promise.all(exitPromises);

		this.sessions.clear();
		this.removeAllListeners();
	}

	private addToScrollback(session: TerminalSession, data: string): void {
		// Preserve ANSI escape sequences for proper terminal rendering
		if (session.scrollback.length === 0) {
			session.scrollback.push(data);
		} else {
			session.scrollback[0] += data;
		}

		const MAX_CHARS = 50000;
		if (session.scrollback[0].length > MAX_CHARS) {
			session.scrollback[0] = session.scrollback[0].slice(-MAX_CHARS);
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
			// node-pty requires all values to be strings
			if (typeof value === "string") {
				sanitized[key] = value;
			}
		}

		return Object.keys(sanitized).length > 0 ? sanitized : undefined;
	}

	private async finalizeHistory(
		session: TerminalSession,
		params: { exitCode?: number; signal?: number; cleanupDir: boolean },
	): Promise<void> {
		if (session.historyFinalized) {
			return;
		}

		const writer = session.historyWriter;
		session.historyWriter = undefined;
		session.historyFinalized = true;

		if (!writer) {
			return;
		}

		if (writer.isOpen()) {
			await writer.writeExit(params.exitCode, params.signal);
		} else {
			await writer.finalize(params.exitCode);
		}

		if (params.cleanupDir) {
			const historyReader = new HistoryReader(
				session.workspaceId,
				session.tabId,
			);
			await historyReader.cleanup();
		}
	}
}

export const terminalManager = new TerminalManager();
