import { useDroppable } from "@dnd-kit/core";
import { cn } from "@superset/ui/utils";
import { useDashboardSidebarDnd } from "../../hooks/useSidebarDnd";
import { PROJECT_COLLECTION_ROOT_DROP } from "../../hooks/useSidebarDnd/projectCollectionDrop";

export function DashboardSidebarProjectRootDrop({
	disabled,
}: {
	disabled: boolean;
}) {
	const { activeType } = useDashboardSidebarDnd();
	const { setNodeRef, isOver } = useDroppable({
		id: PROJECT_COLLECTION_ROOT_DROP,
		disabled,
	});
	return (
		<div
			ref={setNodeRef}
			className={cn(
				"mx-2 h-3 rounded",
				activeType === "project" && "h-8",
				isOver &&
					"bg-sidebar-primary/15 ring-1 ring-inset ring-sidebar-primary",
			)}
		/>
	);
}
