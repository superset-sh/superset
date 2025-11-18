import type { Workspace } from "./workspace";

export enum ProcessType {
	AGENT = "agent",
	TERMINAL = "terminal",
}

export interface Process {
	id: string;
	type: ProcessType;
	workspaceId: string;

	// Metadata
	title: string;
	createdAt: Date;
	updatedAt: Date;
	endedAt?: Date;
}

export interface Terminal extends Process {
	// Placeholder
}

export enum AgentType {
	CODEX = "codex",
	CLAUDE = "claude",
}

export interface Agent extends Process {
	agentType: AgentType;
	status: "idle" | "running" | "stopped" | "error";
}

export interface ProcessOrchestrator {
	get: (id: string) => Promise<Process>;
	list: () => Promise<Process[]>;

	create: (
		type: ProcessType,
		workspace: Workspace,
		agentType?: AgentType,
	) => Promise<Process>;
	update: (id: string, process: Partial<Process>) => void;
	stop: (id: string) => void;
	stopAll: () => void;

	// Danger
	delete: (id: string) => void;
}
