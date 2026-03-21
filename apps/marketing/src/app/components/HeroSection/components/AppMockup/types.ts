export type ActiveDemo =
	| "Use Any Agents"
	| "Create Parallel Branches"
	| "See Changes"
	| "Open in Any IDE";

export type WorkspaceStatus = "permission" | "working" | "review";

export type FileChangeType = "folder" | "add" | "edit" | "delete";

export interface WorkspaceData {
	name: string;
	branch: string;
	add?: number;
	del?: number;
	pr?: string;
	isActive?: boolean;
	status?: WorkspaceStatus;
}

export interface FileChange {
	path: string;
	add?: number;
	del?: number;
	indent?: number;
	type: FileChangeType;
}

export interface PortGroup {
	workspace: string;
	ports: string[];
}

export interface AgentTab {
	src: string;
	alt: string;
	label: string;
	delay: number;
}

export interface AppMockupProps {
	activeDemo?: ActiveDemo;
}
