import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import type { DashboardSidebarWorkspace } from "../../../../../../types";
import { DashboardSidebarWorkspaceItem } from "../../../../../DashboardSidebarWorkspaceItem";

interface SortableCollapsedWorkspaceItemProps {
	sortableId: string;
	workspace: DashboardSidebarWorkspace;
	onHoverCardOpen?: (workspaceId: string) => void | Promise<void>;
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

	// useSortable re-renders this wrapper on every pointer move of any drag in
	// the sidebar's DndContext; keep the row body referentially stable so only
	// the wrapper transform changes.
	const row = useMemo(
		() => (
			<DashboardSidebarWorkspaceItem
				workspace={workspace}
				onHoverCardOpen={onHoverCardOpen}
				shortcutLabel={shortcutLabel}
				isCollapsed
			/>
		),
		[workspace, onHoverCardOpen, shortcutLabel],
	);

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
			{row}
		</div>
	);
}
