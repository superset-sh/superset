import type * as pty from "node-pty";
import type { DataBatcher } from "../data-batcher";
import type { HistoryWriter } from "../terminal-history";

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
	shell: string;
	startTime: number;
	usedFallback: boolean;
	isPersistentBackend?: boolean;
	isExpectedDetach?: boolean;
	cleanupTimeout?: ReturnType<typeof setTimeout>;
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
	scrollback: string;
	wasRecovered: boolean;
	/** True if attach to existing tmux session failed (session preserved for manual recovery) */
	attachFailed?: boolean;
	/** Error code when attachFailed is true */
	errorCode?: string;
	/** Session name for manual kill if needed */
	sessionName?: string;
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
