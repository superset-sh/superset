import type * as pty from "node-pty";
import type { DataBatcher } from "../data-batcher";
import type { FastEscapeFilter } from "../fast-escape-filter";
import type { ScrollbackBuffer } from "../scrollback-buffer";
import type { HistoryWriter } from "../terminal-history";

export interface TerminalSession {
	pty: pty.IPty;
	paneId: string;
	workspaceId: string;
	cwd: string;
	cols: number;
	rows: number;
	lastActive: number;
	scrollback: ScrollbackBuffer;
	isAlive: boolean;
	deleteHistoryOnExit?: boolean;
	wasRecovered: boolean;
	historyWriter?: HistoryWriter;
	escapeFilter: FastEscapeFilter;
	dataBatcher: DataBatcher;
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
	scrollback: string;
	wasRecovered: boolean;
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
	existingScrollback: ScrollbackBuffer | null;
	useFallbackShell?: boolean;
}
