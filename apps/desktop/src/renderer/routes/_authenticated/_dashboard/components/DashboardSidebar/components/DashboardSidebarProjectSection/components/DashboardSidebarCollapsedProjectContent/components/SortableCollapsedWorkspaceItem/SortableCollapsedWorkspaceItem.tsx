import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DashboardSidebarWorkspace } from "../../../../../../types";
import { DashboardSidebarWorkspaceItem } from "../../../../../DashboardSidebarWorkspaceItem";

interface SortableCollapsedWorkspaceItemProps {
	sortableId: string;
	workspace: DashboardSidebarWorkspace;
	onHoverCardOpen?: () => void;
	shortcutLabel?: string;
	disabled?: boolean;
}

export function SortableCollapsedWorkspaceItem({
	sortableId,
	workspace,
	onHoverCardOpen,
	shortcutLabel,
	disabled,
}: SortableCollapsedWorkspaceItemProps) {
	const {
		setNodeRef,
		attributes,
		listeners,
		isDragging,
		transform,
		transition,
	} = useSortable({ id: sortableId, disabled });

	return (
		<div
			ref={setNodeRef}
			className="w-full"
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
				position: isDragging ? "relative" : undefined,
				zIndex: isDragging ? 10 : undefined,
			}}
			{...attributes}
			{...listeners}
		>
			<DashboardSidebarWorkspaceItem
				workspace={workspace}
				onHoverCardOpen={onHoverCardOpen}
				shortcutLabel={shortcutLabel}
				isCollapsed
			/>
		</div>
	);
}
