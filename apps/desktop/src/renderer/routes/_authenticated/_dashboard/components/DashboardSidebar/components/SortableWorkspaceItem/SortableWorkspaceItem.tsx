import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo } from "react";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

interface SortableWorkspaceItemProps {
	sortableId: string;
	workspace: DashboardSidebarWorkspace;
	accentColor?: string | null;
	isInSection?: boolean;
	isActive?: boolean;
	onWorkspaceHover?: (workspaceId: string) => void | Promise<void>;
	shortcutLabel?: string;
	disabled?: boolean;
}

export const SortableWorkspaceItem = memo(function SortableWorkspaceItem({
	sortableId,
	workspace,
	accentColor,
	isInSection,
	isActive = false,
	onWorkspaceHover,
	shortcutLabel,
	disabled,
}: SortableWorkspaceItemProps) {
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
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
				borderLeft: accentColor ? `2px solid ${accentColor}` : undefined,
			}}
			{...attributes}
			{...listeners}
		>
			<DashboardSidebarWorkspaceItem
				workspace={workspace}
				onWorkspaceHover={onWorkspaceHover}
				shortcutLabel={shortcutLabel}
				isInSection={isInSection}
				isActive={isActive}
			/>
		</div>
	);
});
