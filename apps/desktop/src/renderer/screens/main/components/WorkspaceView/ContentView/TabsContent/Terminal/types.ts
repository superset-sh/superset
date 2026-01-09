export interface TerminalProps {
	tabId: string;
	workspaceId: string;
	isTabVisible: boolean;
}

export type TerminalStreamEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number }
	| { type: "disconnect"; reason: string }
	| { type: "error"; error: string; code?: string };
