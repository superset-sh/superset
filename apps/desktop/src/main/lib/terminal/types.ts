import type * as pty from "node-pty";
import type { DataBatcher } from "../data-batcher";
import type { HistoryWriter } from "../terminal-history";
import type { PtyWriteQueue } from "./pty-write-queue";

export interface TerminalSession {
	pty: pty.IPty;
	paneId: string;
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
	dataBatcher: DataBatcher;
	/** Queued writer to prevent blocking on large writes */
	writeQueue: PtyWriteQueue;
	shell: string;
	startTime: number;
	usedFallback: boolean;
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

export interface SessionResult {
	isNew: boolean;
	/**
	 * Initial terminal content (ANSI).
	 * In daemon mode, this is empty - prefer `snapshot.snapshotAnsi` when available.
	 * In non-daemon mode, this contains the recovered scrollback content.
	 */
	scrollback: string;
	wasRecovered: boolean;
	/** Snapshot from daemon (if using daemon mode) */
	snapshot?: {
		snapshotAnsi: string;
		rehydrateSequences: string;
		cwd: string | null;
		modes: Record<string, boolean>;
		cols: number;
		rows: number;
		scrollbackLines: number;
		/** Debug diagnostics for troubleshooting */
		debug?: {
			xtermBufferType: string;
			hasAltScreenEntry: boolean;
			altBuffer?: {
				lines: number;
				nonEmptyLines: number;
				totalChars: number;
				cursorX: number;
				cursorY: number;
				sampleLines: string[];
			};
			normalBufferLines: number;
		};
	};
}

export interface CreateSessionParams {
	paneId: string;
	tabId: string;
	workspaceId: string;
	workspaceName?: string;
	workspacePath?: string;
	rootPath?: string;
	cwd?: string;
	cols?: number;
	rows?: number;
	initialCommands?: string[];
}

export interface InternalCreateSessionParams extends CreateSessionParams {
	existingScrollback: string | null;
	useFallbackShell?: boolean;
}
