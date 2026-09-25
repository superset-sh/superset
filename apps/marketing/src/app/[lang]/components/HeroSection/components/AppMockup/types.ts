export type ActiveDemo =
	| "Orchestrate Parallel Agents"
	| "Automate Tasks"
	| "Remote Access"
	| "See Changes";

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
	icon?: "cloud" | "branch";
}

export interface FileChange {
	path: string;
	add?: number;
	del?: number;
	indent?: number;
	type: FileChangeType;
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
