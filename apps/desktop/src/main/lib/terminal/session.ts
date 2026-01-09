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
import { PtyWriteQueue } from "./pty-write-queue";
import type { InternalCreateSessionParams, TerminalSession } from "./types";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_SCROLLBACK = 10000;
/** Max time to wait for agent hooks before running initial commands */
const AGENT_HOOKS_TIMEOUT_MS = 2000;
const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";

export function createHeadlessTerminal(params: {
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
	// SerializeAddon types expect browser Terminal, but works with headless at runtime
	headless.loadAddon(
		serializer as unknown as Parameters<typeof headless.loadAddon>[0],
	);

	return { headless, serializer };
}

export function getSerializedScrollback(session: TerminalSession): string {
	return session.serializer.serialize();
}

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

	const { headless, serializer } = createHeadlessTerminal({
		cols: terminalCols,
		rows: terminalRows,
	});

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

	const writeQueue = new PtyWriteQueue(ptyProcess);

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
		// Recreate headless on clear (xterm writes are async, so clear() alone is unreliable)
		if (containsClearScrollbackSequence(data)) {
			session.headless.dispose();
			const { headless, serializer } = createHeadlessTerminal({
				cols: session.cols,
				rows: session.rows,
			});
			session.headless = headless;
			session.serializer = serializer;
			const contentAfterClear = extractContentAfterClear(data);
			if (contentAfterClear) {
				session.headless.write(contentAfterClear);
			}
		} else {
			session.headless.write(data);
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
	session.headless.dispose();
}
