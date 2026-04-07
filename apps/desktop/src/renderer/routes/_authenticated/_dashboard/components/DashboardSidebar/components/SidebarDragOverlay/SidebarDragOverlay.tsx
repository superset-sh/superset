import { LuGripVertical } from "react-icons/lu";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import type {
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

type ActiveItem =
	| { type: "workspace"; workspace: DashboardSidebarWorkspace }
	| { type: "section"; section: DashboardSidebarSection };

interface SidebarDragOverlayProps {
	activeItem: ActiveItem | null;
}

export function SidebarDragOverlay({ activeItem }: SidebarDragOverlayProps) {
	if (!activeItem) return null;

	if (activeItem.type === "workspace") {
		return (
			<div className="bg-background shadow-lg">
				<DashboardSidebarWorkspaceItem workspace={activeItem.workspace} />
			</div>
		);
	}

	const { section } = activeItem;
	const hasColor =
		section.color != null && section.color !== PROJECT_COLOR_DEFAULT;

	return (
		<div
			className="bg-background shadow-lg"
			style={{
				borderLeft: hasColor
					? `2px solid ${section.color}`
					: "2px solid var(--color-border)",
			}}
		>
			<div className="flex min-h-8 w-full items-center gap-1.5 pl-0.5 pr-2 py-1.5 text-[11px] font-medium text-muted-foreground">
				<div className="flex shrink-0 items-center justify-center w-5 h-5 opacity-60">
					<LuGripVertical className="size-3" />
				</div>
				<span className="truncate">{section.name}</span>
				<span className="text-[10px] font-normal tabular-nums shrink-0">
					({section.workspaces.length})
				</span>
			</div>
		</div>
	);
}
