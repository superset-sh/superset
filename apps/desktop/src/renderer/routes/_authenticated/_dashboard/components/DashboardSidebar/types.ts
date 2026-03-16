export interface DashboardSidebarWorkspace {
	id: string;
	projectId: string;
	deviceId: string;
	name: string;
	branch: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface DashboardSidebarSection {
	id: string;
	projectId: string;
	name: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	color: string | null;
	workspaces: DashboardSidebarWorkspace[];
}

export interface DashboardSidebarProject {
	id: string;
	name: string;
	slug: string;
	githubRepositoryId: string | null;
	githubOwner: string | null;
	createdAt: Date;
	updatedAt: Date;
	isCollapsed: boolean;
	workspaces: DashboardSidebarWorkspace[];
	sections: DashboardSidebarSection[];
}
