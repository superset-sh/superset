export interface SidebarWorkspace {
	id: string;
	projectId: string;
	worktreePath: string;
	type: "worktree" | "branch";
	branch: string;
	name: string;
	tabOrder: number;
	isUnread: boolean;
	creationStatus?: "preparing" | "generating-branch" | "creating";
}

export interface DragItem {
	kind: "workspace";
	id: string;
	projectId: string;
	sectionId: string | null;
	index: number;
	originalIndex: number;
	/** Set by native drop handlers to prevent the end handler from reordering */
	handled?: boolean;
	/** IDs of all selected workspaces when multi-dragging */
	selectedIds?: string[];
}

export interface SectionDragItem {
	kind: "section";
	sectionId: string;
	projectId: string;
	index: number;
	originalIndex: number;
}

export interface SidebarSection {
	id: string;
	projectId?: string;
	name: string;
	tabOrder: number;
	isCollapsed: boolean;
	color: string | null;
	workspaces: SidebarWorkspace[];
}
