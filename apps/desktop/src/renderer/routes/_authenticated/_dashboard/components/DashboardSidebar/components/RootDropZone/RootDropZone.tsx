import { useDroppable } from "@dnd-kit/core";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useDashboardSidebarDnd } from "../../hooks/useSidebarDnd";
import { FOLDER_DROP_ROOT } from "../../utils/folderDnd";

interface RootDropZoneProps {
	children: ReactNode;
}

/**
 * Drop target for the ungrouped list at the sidebar root, so a project can be
 * dragged back out of a folder. While a project drag is active it grows to
 * claim all empty space below the folders — otherwise "drop in the empty area"
 * would resolve to the nearest folder header instead of the root.
 *
 * Workspace and section drags are ignored: they never re-parent a project, and
 * a zone that grows under them would swallow their drop targets.
 */
export function RootDropZone({ children }: RootDropZoneProps) {
	const { activeType } = useDashboardSidebarDnd();
	const isDragging = activeType === "project";
	const { setNodeRef, isOver } = useDroppable({ id: FOLDER_DROP_ROOT });
	return (
		<div
			ref={setNodeRef}
			className={cn(
				isDragging && "min-h-8 grow rounded-md transition-colors",
				isDragging && isOver && "bg-fill-hover ring-1 ring-primary/50",
			)}
		>
			{children}
		</div>
	);
}
