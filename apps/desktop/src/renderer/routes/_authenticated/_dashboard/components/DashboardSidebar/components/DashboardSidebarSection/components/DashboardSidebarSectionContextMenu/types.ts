export interface DashboardSidebarSectionActionsProps {
	sectionId: string;
	color: string | null;
	onRename: () => void;
	onSetColor: (color: string | null) => void;
	onDelete: () => void;
}

export type SectionActionsMenuKind = "context" | "dropdown";
