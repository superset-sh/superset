export interface V2SidebarWorkspace {
	id: string;
	projectId: string;
	deviceId: string | null;
	name: string;
	branch: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface V2SidebarProject {
	id: string;
	name: string;
	slug: string;
	githubRepositoryId: string | null;
	createdAt: Date;
	updatedAt: Date;
	workspaces: V2SidebarWorkspace[];
}
