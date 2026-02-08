import os from "node:os";
import * as pty from "node-pty";
import { getShellArgs } from "../agent-setup";
import { DataBatcher } from "../data-batcher";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../terminal-escape-filter";
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env";
import { PtyWriteQueue } from "./pty-write-queue";
import type {
	InternalCreateSessionParams,
	ScrollbackBuffer,
	TerminalSession,
} from "./types";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
/** Max time to wait for agent hooks before running initial commands */
const AGENT_HOOKS_TIMEOUT_MS = 2000;
const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";

/** Maximum buffer size in bytes (~10MB) */
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

function createScrollbackBuffer(): ScrollbackBuffer {
	let chunks: string[] = [];
	let totalLength = 0;

	return {
		write(data: string) {
			chunks.push(data);
			totalLength += data.length;

			// Trim from the front if we exceed the cap
			while (totalLength > MAX_BUFFER_SIZE && chunks.length > 1) {
				const removed = chunks.shift()!;
				totalLength -= removed.length;
			}
		},
		getContent(): string {
			return chunks.join("");
		},
		clear() {
			chunks = [];
			totalLength = 0;
		},
		dispose() {
			chunks = [];
			totalLength = 0;
		},
	};
}

export function getSerializedScrollback(session: TerminalSession): string {
	return session.scrollbackBuffer.getContent();
}

export function recoverScrollback(params: {
	existingScrollback: string | null;
	scrollbackBuffer: ScrollbackBuffer;
}): boolean {
	const { existingScrollback, scrollbackBuffer } = params;
	if (existingScrollback) {
		scrollbackBuffer.write(existingScrollback);
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

	if (DEBUG_TERMINAL) {
		console.log("[Terminal Session] Creating session:", {
			paneId,
			shell,
			workingDir,
			terminalCols,
			terminalRows,
			useFallbackShell,
		});
	}

	const env = buildTerminalEnv({
		shell,
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
	});

	const scrollbackBuffer = createScrollbackBuffer();

	const wasRecovered = recoverScrollback({
		existingScrollback,
		scrollbackBuffer,
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

	const writeQueue = new PtyWriteQueue(ptyProcess);

	return {
		pty: ptyProcess,
		paneId,
		workspaceId,
		cwd: workingDir,
		cols: terminalCols,
		rows: terminalRows,
		lastActive: Date.now(),
		scrollbackBuffer,
		isAlive: true,
		wasRecovered,
		dataBatcher,
		writeQueue,
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
		// On clear scrollback, create new buffer
		if (containsClearScrollbackSequence(data)) {
			session.scrollbackBuffer.clear();
			const contentAfterClear = extractContentAfterClear(data);
			if (contentAfterClear) {
				session.scrollbackBuffer.write(contentAfterClear);
			}
		} else {
			session.scrollbackBuffer.write(data);
		}

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
								(error) => {
									console.warn(
										"[terminal/session] Initial command preconditions failed:",
										{
											paneId: session.paneId,
											workspaceId: session.workspaceId,
											error:
												error instanceof Error ? error.message : String(error),
										},
									);
								},
							);
						}

						if (session.isAlive) {
							session.writeQueue.write(initialCommandString);
						}
					})();
				}
			}, 100);
		}
	});
}

export function flushSession(session: TerminalSession): void {
	session.dataBatcher.dispose();
	session.scrollbackBuffer.dispose();
}
