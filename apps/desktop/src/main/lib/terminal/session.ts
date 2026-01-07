import os from "node:os";
import * as pty from "node-pty";
import { getShellArgs } from "../agent-setup";
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env";
import { portManager } from "./port-manager";
import type { InternalCreateSessionParams, TerminalSession } from "./types";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
/** Max time to wait for agent hooks before running initial commands */
const AGENT_HOOKS_TIMEOUT_MS = 2000;

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

	const ptyProcess = spawnPty({
		shell,
		cols: terminalCols,
		rows: terminalRows,
		cwd: workingDir,
		env,
	});

	const session: TerminalSession = {
		pty: ptyProcess,
		paneId,
		workspaceId,
		cwd: workingDir,
		cols: terminalCols,
		rows: terminalRows,
		lastActive: Date.now(),
		scrollback: "",
		isAlive: true,
		shell,
		startTime: Date.now(),
		usedFallback: useFallbackShell,
	};

	// Set up data handler with direct emission (no batching)
	// xterm.js handles rendering efficiently, so batching is unnecessary
	ptyProcess.onData((data) => {
		session.scrollback += data;
		// Check for hints that a port may have been opened (triggers immediate scan)
		portManager.checkOutputForHint(data, session.paneId);
		// Direct emission to renderer
		onData(paneId, data);
	});

	return session;
}

/**
 * Set up initial commands to run after shell prompt is ready.
 * Commands are only sent for new sessions (not reattachments).
 */
export function setupInitialCommands(
	session: TerminalSession,
	initialCommands: string[] | undefined,
	beforeInitialCommands?: Promise<void>,
): void {
	if (!initialCommands || initialCommands.length === 0) {
		return;
	}

	const initialCommandString = `${initialCommands.join(" && ")}\n`;

	// Wait for first data (shell prompt ready), then send commands
	const dataHandler = session.pty.onData(() => {
		dataHandler.dispose(); // Only trigger once

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
	});
}
