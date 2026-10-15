import { LuGripVertical } from "react-icons/lu";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import type {
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";
import type { ProjectSidebarSection } from "../../utils/projectSidebarLane";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

type ActiveItem =
	| { type: "workspace"; workspace: DashboardSidebarWorkspace }
	| { type: "section"; section: DashboardSidebarSection }
	| { type: "projectSection"; section: ProjectSidebarSection };

interface SidebarDragOverlayProps {
	activeItem: ActiveItem | null;
	/** Predicted section color at the current drop position (workspace drags). */
	accentColor?: string | null;
}

export function SidebarDragOverlay({
	activeItem,
	accentColor,
}: SidebarDragOverlayProps) {
	if (!activeItem) return null;

	// Transparent on purpose (both branches): the sidebar surface comes from
	// window vibrancy, so an opaque bg renders as a solid slab under the
	// dragged row.
	if (activeItem.type === "workspace") {
		return (
			<div
				style={{
					boxShadow: accentColor ? `inset 3px 0 ${accentColor}` : undefined,
				}}
			>
				<DashboardSidebarWorkspaceItem workspace={activeItem.workspace} />
			</div>
		);
	}

	const { section } = activeItem;
	const count =
		activeItem.type === "projectSection"
			? activeItem.section.projectCount
			: activeItem.section.workspaces.length;
	const hasColor =
		section.color != null && section.color !== PROJECT_COLOR_DEFAULT;

	return (
		<div
			style={{
				boxShadow: hasColor
					? `inset 3px 0 ${section.color}`
					: "inset 2px 0 var(--color-border)",
			}}
		>
			<div className="flex min-h-8 w-full items-center gap-1.5 pl-0.5 pr-2 py-1.5 text-[11px] font-medium text-muted-foreground">
				<div className="flex shrink-0 items-center justify-center w-5 h-5 opacity-60">
					<LuGripVertical className="size-3" />
				</div>
				<span className="truncate">{section.name}</span>
				<span className="text-[10px] font-normal tabular-nums shrink-0">
					({count})
				</span>
			</div>
		</div>
	);
}
