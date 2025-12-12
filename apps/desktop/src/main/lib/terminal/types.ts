import type * as pty from "node-pty";
import type { DataBatcher } from "../data-batcher";
import type { TerminalEscapeFilter } from "../terminal-escape-filter";
import type { HistoryWriter } from "../terminal-history";

/**
 * Internal session state for a terminal instance.
 */
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
	escapeFilter: TerminalEscapeFilter;
	dataBatcher: DataBatcher;
	shell: string;
	startTime: number;
	usedFallback: boolean;
}

/**
 * Terminal data event emitted when PTY produces output.
 */
export interface TerminalDataEvent {
	type: "data";
	data: string;
}

/**
 * Terminal exit event emitted when PTY process terminates.
 */
export interface TerminalExitEvent {
	type: "exit";
	exitCode: number;
	signal?: number;
}

export type TerminalEvent = TerminalDataEvent | TerminalExitEvent;

/**
 * Result returned when creating or attaching to a terminal session.
 */
export interface SessionResult {
	isNew: boolean;
	scrollback: string;
	wasRecovered: boolean;
}

/**
 * Parameters for creating a new terminal session.
 */
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

/**
 * Internal parameters for doCreateSession including existing scrollback.
 */
export interface InternalCreateSessionParams extends CreateSessionParams {
	existingScrollback: string | null;
	useFallbackShell?: boolean;
}
