export interface TerminalProps {
	tabId: string;
	workspaceId: string;
}

export type TerminalStreamEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number; signal?: number }
	| { type: "disconnect"; reason: string }
	| { type: "error"; error: string; code?: string };
