import type { Workspace } from "./workspace";

export enum ProcessType {
	AGENT = "agent",
	TERMINAL = "terminal",
}

export enum ProcessStatus {
	RUNNING = "running",
	IDLE = "idle",
	STOPPED = "stopped",
	ERROR = "error",
}

export interface Process {
	id: string;
	type: ProcessType;
	workspaceId: string;
	status: ProcessStatus;

	// Metadata
	title: string;
	createdAt: Date;
	updatedAt: Date;
	endedAt?: Date;
	pid?: number;
	lastHeartbeat?: Date;
	launchCommand?: string;
}

export interface Terminal extends Process {
	type: ProcessType.TERMINAL;
}

export enum AgentType {
	CODEX = "codex",
	CLAUDE = "claude",
	CURSOR = "cursor",
}

export interface Agent extends Process {
	type: ProcessType.AGENT;
	agentType: AgentType;
	sessionName?: string;
}

export interface ProcessOrchestrator {
	get: (id: string) => Promise<Process>;
	list: (workspaceId?: string) => Promise<Process[]>;

	create: (
		type: ProcessType,
		workspace: Workspace,
		agentType?: AgentType,
	) => Promise<Process>;
	update: (id: string, process: Partial<Process>) => void;
	stop: (id: string) => void;
	stopAll: () => Promise<number>;

	// Danger
	delete: (id: string) => void;
}
