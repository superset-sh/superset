export interface DashboardSidebarSectionActionsProps {
	color: string | null;
	/** What the menu calls the container: a workspace group or a project section. */
	noun?: SectionActionsNoun;
	onRename: () => void;
	onSetColor?: (color: string | null) => void;
	onDelete: () => void;
	/** Tag-backed folders only: hide the folder without untagging anyone. */
	onHide?: () => void;
}

export type SectionActionsMenuKind = "context" | "dropdown";

export type SectionActionsNoun = "group" | "section";
