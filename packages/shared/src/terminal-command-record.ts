export type TerminalCommandSource =
	| "user"
	| "agent"
	| "initial-command"
	| "system";

export type TerminalCommandStatus =
	| "running"
	| "succeeded"
	| "failed"
	| "unknown";

export const TERMINAL_COMMAND_RECORD_LIMIT = 500;

export interface TerminalCommandRecord {
	id: string;
	terminalId: string;
	workspaceId: string;
	sequence: number;
	command: string;
	source: TerminalCommandSource;
	cwd: string | null;
	gitBranch: string | null;
	startedAt: number;
	endedAt: number | null;
	status: TerminalCommandStatus;
	exitCode: number | null;
	outputHead: string;
	outputTail: string;
	outputLineCount: number;
	truncatedLineCount: number;
	byteCount: number;
}
