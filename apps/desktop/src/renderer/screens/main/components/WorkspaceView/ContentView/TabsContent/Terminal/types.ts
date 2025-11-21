export interface TerminalProps {
	tabId: string;
	workspaceId: string;
}

export type TerminalStreamEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number };
