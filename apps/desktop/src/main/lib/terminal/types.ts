import type { SerializeAddon } from "@xterm/addon-serialize";
import type { Terminal as HeadlessTerminal } from "@xterm/headless";
import type * as pty from "node-pty";
import type { DataBatcher } from "../data-batcher";

export interface TerminalSession {
	pty: pty.IPty;
	paneId: string;
	workspaceId: string;
	cwd: string;
	cols: number;
	rows: number;
	lastActive: number;
	headless: HeadlessTerminal;
	serializer: SerializeAddon;
	isAlive: boolean;
	wasRecovered: boolean;
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
	existingScrollback: string | null;
	useFallbackShell?: boolean;
}
