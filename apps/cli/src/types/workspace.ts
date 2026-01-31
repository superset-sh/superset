export enum WorkspaceType {
	LOCAL = "local",
	CLOUD = "cloud",
}

export interface Workspace {
	id: string;
	type: WorkspaceType;
	environmentId: string;
	name?: string;
	description?: string;
	createdAt: Date;
	updatedAt: Date;
	lastUsedAt?: Date;
	defaultAgents?: string[]; // AgentType array
}

export interface LocalWorkspace extends Workspace {
	type: WorkspaceType.LOCAL;
	path: string;
}

export interface CloudWorkspace extends Workspace {
	type: WorkspaceType.CLOUD;
	branch: string; // git branch/ref
}

export interface WorkspaceOrchestrator {
	get: (id: string) => Promise<Workspace>;
	list: (environmentId?: string) => Promise<Workspace[]>;
	getCurrent: () => Promise<Workspace | null>;

	// Note: For cloud, will need more optional params
	create: (
		environmentId: string,
		type: WorkspaceType,
		options?: {
			path?: string;
			branch?: string;
			name?: string;
			description?: string;
			defaultAgents?: string[];
		},
	) => Promise<Workspace>;
	update: (id: string, workspace: Partial<Workspace>) => void;
	use: (id: string) => Promise<void>;

	// Danger
	delete: (id: string) => void;
}
