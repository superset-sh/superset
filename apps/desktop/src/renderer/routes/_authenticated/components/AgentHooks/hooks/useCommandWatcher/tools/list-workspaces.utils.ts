import type { SelectProject, SelectWorkspace } from "@superset/local-db";

export interface ListedWorkspace {
	id: string;
	name: string;
	path: string;
	branch: string;
	isActive: boolean;
	projectId: string;
	type: "worktree" | "branch";
}

export type WorkspaceListSourceWorkspace = Pick<
	SelectWorkspace,
	"id" | "name" | "branch" | "projectId" | "type"
>;

export type WorkspaceListSourceProject = Pick<
	SelectProject,
	"id" | "mainRepoPath"
>;

export function buildWorkspaceList({
	workspaces,
	projects,
	activeWorkspaceId,
	getWorktreePathByWorkspaceId,
}: {
	workspaces: WorkspaceListSourceWorkspace[];
	projects?: WorkspaceListSourceProject[];
	activeWorkspaceId: string | null;
	getWorktreePathByWorkspaceId?: (workspaceId: string) => string | undefined;
}): ListedWorkspace[] {
	const mainRepoPathByProjectId = new Map(
		(projects ?? []).map((project) => [project.id, project.mainRepoPath]),
	);

	return workspaces.map((workspace) => ({
		id: workspace.id,
		name: workspace.name,
		path:
			workspace.type === "branch"
				? (mainRepoPathByProjectId.get(workspace.projectId) ?? "")
				: (getWorktreePathByWorkspaceId?.(workspace.id) ?? ""),
		branch: workspace.branch,
		isActive: workspace.id === activeWorkspaceId,
		projectId: workspace.projectId,
		type: workspace.type as "worktree" | "branch",
	}));
}
