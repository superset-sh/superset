export type CloudWorkspaceStatusFilter = "active" | "archived";

export interface CloudWorkspacesSearch {
	people?: string[];
	projects?: string[];
	labels?: string[];
	status?: CloudWorkspaceStatusFilter[];
}
