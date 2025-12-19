import type { MosaicNode } from "./mosaic";

export type TabType =
	| "terminal"
	| "editor"
	| "browser"
	| "preview"
	| "group"
	| "port"
	| "diff";

export interface Tab {
	id: string;
	name: string;
	type: TabType;
	command?: string | null;
	cwd?: string;
	url?: string;
	tabs?: Tab[];
	mosaicTree?: MosaicNode<string>;
	createdAt: string;
}

export interface CreateTabInput {
	workspaceId: string;
	worktreeId: string;
	parentTabId?: string;
	name: string;
	type?: TabType;
	command?: string | null;
	url?: string;
	copyFromTabId?: string;
}

export interface UpdatePreviewTabInput {
	workspaceId: string;
	worktreeId: string;
	tabId: string;
	url: string;
}
