import type { Terminal as XTerm } from "@xterm/xterm";

export interface TerminalSession {
	xterm: XTerm;
	write: (data: string) => void;
}

export interface TerminalProps {
	tabId: string;
	workspaceId: string;
	title?: string;
	onSessionReady?: (session: TerminalSession) => void;
}

export type TerminalStreamEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number };
