import os from "node:os";
import * as pty from "node-pty";
import { getShellArgs } from "../agent-setup";
import { DataBatcher } from "../data-batcher";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
	TerminalEscapeFilter,
} from "../terminal-escape-filter";
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env";
import { portManager } from "./port-manager";
import type { InternalCreateSessionParams, TerminalSession } from "./types";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export async function recoverScrollback(
	existingScrollback: string | null,
	_workspaceId: string,
	_paneId: string,
): Promise<{ scrollback: string; wasRecovered: boolean }> {
	// History persistence disabled - only use in-memory scrollback
	// See: https://github.com/superset-sh/superset/pull/493
	if (existingScrollback) {
		return { scrollback: existingScrollback, wasRecovered: true };
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

	// Scan recovered scrollback for ports (verification will check if still listening)
	if (wasRecovered && recoveredScrollback) {
		portManager.scanOutput(recoveredScrollback, paneId, workspaceId);
	}

	const ptyProcess = spawnPty({
		shell,
		cols: terminalCols,
		rows: terminalRows,
		cwd: workingDir,
		env,
	});

	// History persistence disabled - no HistoryWriter created
	// See: https://github.com/superset-sh/superset/pull/493

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
		historyWriter: undefined,
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

	session.pty.onData((data) => {
		let dataToStore = data;

		if (containsClearScrollbackSequence(data)) {
			session.scrollback = "";
			session.escapeFilter = new TerminalEscapeFilter();
			onHistoryReinit().catch(() => {});
			dataToStore = extractContentAfterClear(data);
		}

		const filteredData = session.escapeFilter.filter(dataToStore);
		session.scrollback += filteredData;
		session.historyWriter?.write(filteredData);

		// Scan for port patterns in terminal output
		portManager.scanOutput(filteredData, session.paneId, session.workspaceId);

		session.dataBatcher.write(data);

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
	_session: TerminalSession,
	_exitCode?: number,
): Promise<void> {
	// History persistence disabled - no-op
	// See: https://github.com/superset-sh/superset/pull/493
}

export async function reinitializeHistory(
	_session: TerminalSession,
): Promise<void> {
	// History persistence disabled - no-op
	// See: https://github.com/superset-sh/superset/pull/493
}

export function flushSession(session: TerminalSession): void {
	session.dataBatcher.dispose();

	const remaining = session.escapeFilter.flush();
	if (remaining) {
		session.scrollback += remaining;
		session.historyWriter?.write(remaining);
	}
}
