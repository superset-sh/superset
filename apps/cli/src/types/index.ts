export interface Environment {
	id: string;
	gitRef: string;
}

export enum WorkspaceType {
	LOCAL = "local",
	CLOUD = "cloud",
}

export interface Workspace {
	id: string;
	type: WorkspaceType;
	environmentId: string;
}

export interface LocalWorkspace extends Workspace {
	type: WorkspaceType.LOCAL;
	path: string;
}

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
	// placeholder
}

export enum AgentType {
	CODEX = "codex",
	CLAUDE = "claude",
}

export interface Agent extends Process {
	agentType: AgentType;
	status: "idle" | "running" | "stopped" | "error";
}

export interface WorkspaceOrchestrator {
	get: (id: string) => Promise<Workspace>;
	list: () => Promise<Workspace[]>;

	// Note: For cloud, will need more optional params
	create: (type: WorkspaceType, path?: string) => Promise<Workspace>;
	update: (id: string, workspace: Partial<Workspace>) => void;

	// Danger
	delete: (id: string) => void;
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
