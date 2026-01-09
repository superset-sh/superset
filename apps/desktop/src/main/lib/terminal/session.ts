import os from "node:os";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
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
/** Default scrollback buffer size for headless terminal */
const DEFAULT_SCROLLBACK = 10000;
/** Max time to wait for agent hooks before running initial commands */
const AGENT_HOOKS_TIMEOUT_MS = 2000;

/**
 * Creates a headless xterm instance with serialize addon.
 * This handles escape sequence processing properly, producing clean serialized output.
 */
function createHeadlessTerminal(params: {
	cols: number;
	rows: number;
	scrollback?: number;
}): { headless: HeadlessTerminal; serializer: SerializeAddon } {
	const { cols, rows, scrollback = DEFAULT_SCROLLBACK } = params;

	const headless = new HeadlessTerminal({
		cols,
		rows,
		scrollback,
		allowProposedApi: true,
	});

	const serializer = new SerializeAddon();
	// SerializeAddon types expect browser Terminal, but it works with headless at runtime
	// since it only accesses the buffer API which both terminals share
	headless.loadAddon(
		serializer as unknown as Parameters<typeof headless.loadAddon>[0],
	);

	return { headless, serializer };
}

/**
 * Gets the serialized scrollback from a session's headless terminal.
 */
export function getSerializedScrollback(session: TerminalSession): string {
	return session.serializer.serialize();
}

/**
 * Recovers scrollback by writing existing data to the headless terminal.
 */
export function recoverScrollback(params: {
	existingScrollback: string | null;
	headless: HeadlessTerminal;
}): boolean {
	const { existingScrollback, headless } = params;
	if (existingScrollback) {
		headless.write(existingScrollback);
		return true;
	}
	return false;
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

	// Create headless terminal for proper escape sequence processing
	const { headless, serializer } = createHeadlessTerminal({
		cols: terminalCols,
		rows: terminalRows,
	});

	// Recover existing scrollback into headless terminal
	const wasRecovered = recoverScrollback({
		existingScrollback,
		headless,
	});

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
		headless,
		serializer,
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
		// Check for clear scrollback sequences (ED3: ESC[3J)
		// When detected, recreate the headless terminal to ensure a fresh state
		// (xterm's write queue is async, so clear/reset alone may not work reliably)
		if (containsClearScrollbackSequence(data)) {
			// Dispose old headless terminal
			session.headless.dispose();
			// Create new headless terminal with same dimensions
			const newHeadless = new HeadlessTerminal({
				cols: session.cols,
				rows: session.rows,
				scrollback: DEFAULT_SCROLLBACK,
				allowProposedApi: true,
			});
			const newSerializer = new SerializeAddon();
			newHeadless.loadAddon(
				newSerializer as unknown as Parameters<typeof newHeadless.loadAddon>[0],
			);
			session.headless = newHeadless;
			session.serializer = newSerializer;
			// Only write content after the clear sequence
			const contentAfterClear = extractContentAfterClear(data);
			if (contentAfterClear) {
				session.headless.write(contentAfterClear);
			}
		} else {
			// Feed data to headless terminal for proper escape sequence processing
			session.headless.write(data);
		}

		// Send to renderer
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
	session.headless.dispose();
}
