export interface PendingSetupAgent {
	agent: string;
	prompt: string;
	attachmentIds?: string[];
	model?: string;
	effort?: string;
	mode?: string;
}

export interface WorkspaceSetupState {
	userId?: string;
	base?: { ref: string; commit: string; usedCache: boolean };
	status: "linking" | "running" | "failed" | "launching" | "ready";
	step: "files" | "command" | "agents";
	files: string[];
	skippedFiles: string[];
	failedPath?: string;
	error?: string;
	terminalId?: string;
	attemptId?: string;
	command?: string;
	agents: PendingSetupAgent[];
	commandAfterSetup?: string;
	runSetup: boolean;
	startedAt: number;
	updatedAt: number;
}
