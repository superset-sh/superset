import os from "node:os";
import * as pty from "node-pty";
import { getShellArgs } from "../agent-setup";
import { DataBatcher } from "../data-batcher";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
	TerminalEscapeFilter,
} from "../terminal-escape-filter";
import { HistoryReader, HistoryWriter } from "../terminal-history";
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env";
import type { InternalCreateSessionParams, TerminalSession } from "./types";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export async function recoverScrollback(
	existingScrollback: string | null,
	workspaceId: string,
	paneId: string,
): Promise<{ scrollback: string; wasRecovered: boolean }> {
	if (existingScrollback) {
		return { scrollback: existingScrollback, wasRecovered: true };
	}

	const historyReader = new HistoryReader(workspaceId, paneId);
	const history = await historyReader.read();

	if (history.scrollback) {
		// Strip protocol responses from recovered history
		const recoveryFilter = new TerminalEscapeFilter();
		const filtered =
			recoveryFilter.filter(history.scrollback) + recoveryFilter.flush();
		return { scrollback: filtered, wasRecovered: true };
	}

	return { scrollback: "", wasRecovered: false };
}

function spawnPty(params: {
	shell: string;
	cols: number;
	rows: number;
	cwd: string;
	env: Record<string, string>;
}): pty.IPty {
	const { shell, cols, rows, cwd, env } = params;
	const shellArgs = getShellArgs(shell);

	return pty.spawn(shell, shellArgs, {
		name: "xterm-256color",
		cols,
		rows,
		cwd,
		env,
	});
}

export async function createSession(
	params: InternalCreateSessionParams,
	onData: (paneId: string, data: string) => void,
): Promise<TerminalSession> {
	const {
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
		cwd,
		cols,
		rows,
		existingScrollback,
		useFallbackShell = false,
	} = params;

	const shell = useFallbackShell ? FALLBACK_SHELL : getDefaultShell();
	const workingDir = cwd || os.homedir();
	const terminalCols = cols || DEFAULT_COLS;
	const terminalRows = rows || DEFAULT_ROWS;

	const env = buildTerminalEnv({
		shell,
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
	});

	const { scrollback: recoveredScrollback, wasRecovered } =
		await recoverScrollback(existingScrollback, workspaceId, paneId);

	const ptyProcess = spawnPty({
		shell,
		cols: terminalCols,
		rows: terminalRows,
		cwd: workingDir,
		env,
	});

	const historyWriter = new HistoryWriter(
		workspaceId,
		paneId,
		workingDir,
		terminalCols,
		terminalRows,
	);
	await historyWriter.init(recoveredScrollback || undefined);

	const dataBatcher = new DataBatcher((batchedData) => {
		onData(paneId, batchedData);
	});

	return {
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
		dataBatcher,
		shell,
		startTime: Date.now(),
		usedFallback: useFallbackShell,
	};
}

export function setupDataHandler(
	session: TerminalSession,
	initialCommands: string[] | undefined,
	wasRecovered: boolean,
	onHistoryReinit: () => Promise<void>,
): void {
	const shouldRunCommands =
		!wasRecovered && initialCommands && initialCommands.length > 0;
	let commandsSent = false;

	// Separate stateful filter for display path - handles chunked CPR/DA/OSC responses
	let displayEscapeFilter = new TerminalEscapeFilter();

	session.pty.onData((data) => {
		// Check for clear scrollback sequences (ESC[3J, ESC c)
		const hasClear = containsClearScrollbackSequence(data);
		if (hasClear) {
			session.scrollback = "";
			session.escapeFilter = new TerminalEscapeFilter();
			displayEscapeFilter = new TerminalEscapeFilter();
			onHistoryReinit().catch(() => {});
		}

		// For history/scrollback: filter CPR/DA AND strip content before clear
		const dataForHistory = hasClear ? extractContentAfterClear(data) : data;
		const filteredForHistory = session.escapeFilter.filter(dataForHistory);
		session.scrollback += filteredForHistory;
		session.historyWriter?.write(filteredForHistory);

		// For renderer: filter CPR/DA but PRESERVE clear sequences so terminal visually clears
		// Uses separate stateful filter to handle chunked escape sequences
		const filteredForDisplay = displayEscapeFilter.filter(data);
		session.dataBatcher.write(filteredForDisplay);

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
}

export async function closeSessionHistory(
	session: TerminalSession,
	exitCode?: number,
): Promise<void> {
	if (session.deleteHistoryOnExit) {
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

export async function reinitializeHistory(
	session: TerminalSession,
): Promise<void> {
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

export function flushSession(session: TerminalSession): void {
	session.dataBatcher.dispose();

	const remaining = session.escapeFilter.flush();
	if (remaining) {
		session.scrollback += remaining;
		session.historyWriter?.write(remaining);
	}
}
