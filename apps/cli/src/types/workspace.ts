import type { Environment } from "./environment";

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

export interface WorkspaceOrchestrator {
	get: (id: string) => Promise<Workspace>;
	list: (environmentId?: string) => Promise<Workspace[]>;

	// Note: For cloud, will need more optional params
	create: (
		environmentId: string,
		type: WorkspaceType,
		path?: string,
	) => Promise<Workspace>;
	update: (id: string, workspace: Partial<Workspace>) => void;

	// Danger
	delete: (id: string) => void;
}
