import os from "node:os";
import * as pty from "node-pty";
import { getShellArgs } from "../agent-setup";
import { DataBatcher } from "../data-batcher";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../terminal-escape-filter";
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env";
import type { InternalCreateSessionParams, TerminalSession } from "./types";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
/** Max time to wait for agent hooks before running initial commands */
const AGENT_HOOKS_TIMEOUT_MS = 2000;

export function recoverScrollback(existingScrollback: string | null): {
	scrollback: string;
	wasRecovered: boolean;
} {
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
		recoverScrollback(existingScrollback);

	const ptyProcess = spawnPty({
		shell,
		cols: terminalCols,
		rows: terminalRows,
		cwd: workingDir,
		env,
	});

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
	beforeInitialCommands?: Promise<void>,
): void {
	const initialCommandString =
		!wasRecovered && initialCommands && initialCommands.length > 0
			? `${initialCommands.join(" && ")}\n`
			: null;
	let commandsSent = false;

	session.pty.onData((data) => {
		let dataToStore = data;

		if (containsClearScrollbackSequence(data)) {
			session.scrollback = "";
			dataToStore = extractContentAfterClear(data);
		}

		session.scrollback += dataToStore;

		session.dataBatcher.write(data);

		if (initialCommandString && !commandsSent) {
			commandsSent = true;
			setTimeout(() => {
				if (session.isAlive) {
					void (async () => {
						if (beforeInitialCommands) {
							const timeout = new Promise<void>((resolve) =>
								setTimeout(resolve, AGENT_HOOKS_TIMEOUT_MS),
							);
							await Promise.race([beforeInitialCommands, timeout]).catch(
								() => {},
							);
						}

						if (session.isAlive) {
							session.pty.write(initialCommandString);
						}
					})();
				}
			}, 100);
		}
	});
}

export function flushSession(session: TerminalSession): void {
	session.dataBatcher.dispose();
}
