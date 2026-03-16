export interface V2SidebarWorkspace {
	id: string;
	projectId: string;
	deviceId: string;
	name: string;
	branch: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface V2SidebarSection {
	id: string;
	projectId: string;
	name: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	workspaces: V2SidebarWorkspace[];
}

export interface V2SidebarProject {
	id: string;
	name: string;
	slug: string;
	githubRepositoryId: string | null;
	githubOwner: string | null;
	createdAt: Date;
	updatedAt: Date;
	isCollapsed: boolean;
	workspaces: V2SidebarWorkspace[];
	sections: V2SidebarSection[];
}
