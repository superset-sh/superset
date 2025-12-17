import os from "node:os";
import * as pty from "node-pty";
import { getShellArgs } from "../agent-setup";
import { DataBatcher } from "../data-batcher";
import { FastEscapeFilter } from "../fast-escape-filter";
import { ScrollbackBuffer } from "../scrollback-buffer";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../terminal-escape-filter";
import { HistoryReader, HistoryWriter } from "../terminal-history";
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env";
import type { InternalCreateSessionParams, TerminalSession } from "./types";

// ESC character for fast-path checks
const ESC = "\x1b";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export async function recoverScrollback(
	existingScrollback: ScrollbackBuffer | null,
	workspaceId: string,
	paneId: string,
): Promise<{ scrollback: ScrollbackBuffer; wasRecovered: boolean }> {
	if (existingScrollback && existingScrollback.length > 0) {
		return { scrollback: existingScrollback, wasRecovered: true };
	}

	const historyReader = new HistoryReader(workspaceId, paneId);
	const history = await historyReader.read();

	if (history.scrollback) {
		// Strip protocol responses from recovered history
		const recoveryFilter = new FastEscapeFilter();
		const filtered =
			recoveryFilter.filter(history.scrollback) + recoveryFilter.flush();
		return {
			scrollback: ScrollbackBuffer.fromString(filtered),
			wasRecovered: true,
		};
	}

	return { scrollback: new ScrollbackBuffer(), wasRecovered: false };
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
	// Pass string representation to history writer for persistence
	const scrollbackStr =
		recoveredScrollback.length > 0 ? recoveredScrollback.toString() : undefined;
	await historyWriter.init(scrollbackStr);

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
		escapeFilter: new FastEscapeFilter(),
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

	session.pty.onData((data) => {
		// Fast path: check if data contains any escape sequences
		// Most plain text output has no ESC, so we can skip all filtering
		const hasEsc = data.includes(ESC);

		if (!hasEsc) {
			// No escape sequences - skip all filtering, direct passthrough
			session.dataBatcher.write(data);
			session.scrollback.append(data);
			session.historyWriter?.write(data);
		} else {
			// Slow path: data contains escape sequences, need to filter
			// Check for clear scrollback sequences (ESC[3J, ESC c)
			const hasClear = containsClearScrollbackSequence(data);
			if (hasClear) {
				session.scrollback.clear();
				session.escapeFilter = new FastEscapeFilter();
				onHistoryReinit().catch(() => {});
			}

			// Filter once: remove CPR/DA/OSC query responses but PRESERVE clear sequences
			const filtered = session.escapeFilter.filter(data);

			// Send filtered data to renderer (clear sequences preserved for visual clearing)
			session.dataBatcher.write(filtered);

			// For history: apply extractContentAfterClear to the already-filtered result
			const dataForHistory = hasClear
				? extractContentAfterClear(filtered)
				: filtered;
			session.scrollback.append(dataForHistory);
			session.historyWriter?.write(dataForHistory);
		}

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
		session.scrollback.append(remaining);
		session.historyWriter?.write(remaining);
	}
}
