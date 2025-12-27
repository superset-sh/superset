export interface Tab {
	id: string;
	name: string;
	type:
		| "terminal"
		| "editor"
		| "browser"
		| "preview"
		| "group"
		| "port"
		| "diff";
	command?: string | null;
	cwd?: string;
	url?: string;
	tabs?: Tab[];
	createdAt: string;
}

export interface CreateTabInput {
	workspaceId: string;
	worktreeId: string;
	parentTabId?: string;
	name: string;
	type?: Tab["type"];
	command?: string | null;
	url?: string;
}

export interface UpdatePreviewTabInput {
	workspaceId: string;
	worktreeId: string;
	tabId: string;
	url: string;
}
