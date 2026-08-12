import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import type { WorkspaceSelectionEvent } from "../../providers/DashboardSidebarSelectionProvider";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

interface SortableWorkspaceItemProps {
	sortableId: string;
	workspace: DashboardSidebarWorkspace;
	accentColor?: string | null;
	isInSection?: boolean;
	onHoverCardOpen?: (workspaceId: string) => void | Promise<void>;
	shortcutLabel?: string;
	disabled?: boolean;
	isSelected?: boolean;
	onSelectionClick?: (event: WorkspaceSelectionEvent) => boolean;
	/** Set for rows rendered inside the top-level Pinned section. */
	pinnedContext?: { projectName: string | null; projectIconUrl: string | null };
}

export function SortableWorkspaceItem({
	sortableId,
	workspace,
	accentColor,
	isInSection,
	onHoverCardOpen,
	shortcutLabel,
	disabled,
	isSelected = false,
	onSelectionClick,
	pinnedContext,
}: SortableWorkspaceItemProps) {
	const {
		setNodeRef,
		attributes,
		listeners,
		isDragging,
		transform,
		transition,
	} = useSortable({ id: sortableId, disabled });

	// useSortable re-renders this wrapper on every pointer move of any drag in
	// the sidebar's DndContext; the row body (query hooks, menus) is expensive,
	// so keep it referentially stable while only the wrapper transform changes.
	const row = useMemo(
		() => (
			<DashboardSidebarWorkspaceItem
				workspace={workspace}
				onHoverCardOpen={onHoverCardOpen}
				shortcutLabel={shortcutLabel}
				isInSection={isInSection}
				isSelected={isSelected}
				onSelectionClick={onSelectionClick}
				pinnedContext={pinnedContext}
			/>
		),
		[
			workspace,
			onHoverCardOpen,
			shortcutLabel,
			isInSection,
			isSelected,
			onSelectionClick,
			pinnedContext,
		],
	);

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
			{row}
		</div>
	);
}
