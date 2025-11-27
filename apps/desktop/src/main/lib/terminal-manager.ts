import { EventEmitter } from "node:events";
import os from "node:os";
import * as pty from "node-pty";
import { NOTIFICATIONS_PORT } from "shared/constants";
import { getSupersetPath } from "./agent-setup";
import { HistoryReader, HistoryWriter } from "./terminal-history";

// ESC character for regex patterns
const ESC = "\x1b";
const BEL = "\x07";

/**
 * Filters out terminal query responses from PTY output before storing in scrollback.
 * These are responses to xterm.js queries that shouldn't be replayed on reattach:
 * - Cursor Position Reports (CPR): ESC [ row ; col R
 * - Device Attributes (DA): ESC [ ? Ps c
 * - OSC color responses: ESC ] 10;rgb:... or ESC ] 11;rgb:... etc.
 * - DECRPM responses: ESC [ ? Ps ; Pm $ y
 */
function filterTerminalQueryResponses(data: string): string {
	// Cursor Position Report: ESC[<row>;<col>R
	// Device Attributes: ESC[?<params>c or ESC[<params>c
	// DECRPM: ESC[?<param>;<mode>$y
	const csiPattern = new RegExp(
		`${ESC}\\[\\??[\\d;]*[Rc]|${ESC}\\[\\?\\d+;\\d+\\$y`,
		"g",
	);

	// OSC responses for colors (10=fg, 11=bg, 12=cursor, etc.): ESC]<num>;rgb:...<ST>
	// String terminator can be BEL or ST (ESC\)
	const oscPattern = new RegExp(
		`${ESC}\\]1[0-9];rgb:[0-9a-fA-F]{4}/[0-9a-fA-F]{4}/[0-9a-fA-F]{4}(?:${BEL}|${ESC}\\\\)`,
		"g",
	);

	return data.replace(csiPattern, "").replace(oscPattern, "");
}

interface TerminalSession {
	pty: pty.IPty;
	tabId: string;
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
		tabTitle: string;
		workspaceName: string;
		cwd?: string;
		cols?: number;
		rows?: number;
	}): Promise<{
		isNew: boolean;
		scrollback: string;
		wasRecovered: boolean;
	}> {
		const { tabId, workspaceId, tabTitle, workspaceName, cwd, cols, rows } =
			params;

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

		// Use in-memory scrollback from dead session if available
		const existingScrollback = existing?.scrollback || null;

		const shell = this.getDefaultShell();
		const workingDir = cwd || os.homedir();
		const terminalCols = cols || this.DEFAULT_COLS;
		const terminalRows = rows || this.DEFAULT_ROWS;

		const baseEnv = this.sanitizeEnv(process.env) || {};
		const env = {
			...baseEnv,
			PATH: getSupersetPath(),
			SUPERSET_TAB_ID: tabId,
			SUPERSET_TAB_TITLE: tabTitle,
			SUPERSET_WORKSPACE_NAME: workspaceName,
			SUPERSET_WORKSPACE_ID: workspaceId,
			SUPERSET_PORT: String(NOTIFICATIONS_PORT),
		};

		// Recover scrollback from in-memory dead session or disk
		let recoveredScrollback = "";
		let wasRecovered = false;
		if (existingScrollback) {
			recoveredScrollback = existingScrollback;
			wasRecovered = true;
		} else {
			const historyReader = new HistoryReader(workspaceId, tabId);
			const history = await historyReader.read();
			if (history.scrollback) {
				recoveredScrollback = history.scrollback;
				wasRecovered = true;
			}
		}

		const shellArgs =
			shell.includes("zsh") || shell.includes("bash") ? ["-l"] : [];

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
			tabId,
			workingDir,
			terminalCols,
			terminalRows,
		);
		await historyWriter.init(recoveredScrollback || undefined);

		const session: TerminalSession = {
			pty: ptyProcess,
			tabId,
			workspaceId,
			cwd: workingDir,
			cols: terminalCols,
			rows: terminalRows,
			lastActive: Date.now(),
			scrollback: recoveredScrollback,
			isAlive: true,
			wasRecovered,
			historyWriter,
		};

		ptyProcess.onData((data) => {
			// Filter terminal query responses before storing in scrollback
			// These are responses to xterm.js queries that display as garbage on reattach
			const filteredData = filterTerminalQueryResponses(data);
			session.scrollback += filteredData;
			session.historyWriter?.write(filteredData);
			// Emit original data to xterm - it needs to process the responses
			this.emit(`data:${tabId}`, data);
		});

		ptyProcess.onExit(async ({ exitCode, signal }) => {
			session.isAlive = false;

			await this.closeHistory(session, exitCode);

			this.emit(`exit:${tabId}`, exitCode, signal);

			const timeout = setTimeout(() => {
				this.sessions.delete(tabId);
			}, 5000);
			timeout.unref();
		});

		this.sessions.set(tabId, session);

		return {
			isNew: true,
			scrollback: session.scrollback,
			wasRecovered,
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
			await this.closeHistory(session);
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

					const timeoutId = setTimeout(() => {
						this.off(`exit:${tabId}`, exitHandler);
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
				session.tabId,
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
