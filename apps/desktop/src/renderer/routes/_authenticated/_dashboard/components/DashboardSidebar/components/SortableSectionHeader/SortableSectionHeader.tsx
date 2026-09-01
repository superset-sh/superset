import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useState } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { parseSidebarFolderKey } from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import type { DashboardSidebarSection } from "../../types";
import { DashboardSidebarGroupHeader } from "../DashboardSidebarGroupHeader";
import {
	DashboardSidebarSectionActionsDropdown,
	DashboardSidebarSectionContextMenu,
} from "../DashboardSidebarSection/components/DashboardSidebarSectionContextMenu";

interface SortableSectionHeaderProps {
	sortableId: string;
	section: DashboardSidebarSection;
	onDelete: (sectionId: string) => void;
	onRename: (sectionId: string, name: string) => void;
	onToggleCollapse: (sectionId: string) => void;
}

export function SortableSectionHeader({
	sortableId,
	section,
	onDelete,
	onRename,
	onToggleCollapse,
}: SortableSectionHeaderProps) {
	const { setSectionColor } = useDashboardSidebarState();
	const { clearPendingSectionRename, pendingRenameSectionId } =
		useDashboardSidebarSectionRename();
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(section.name);

	const { setTagFolderHidden } = useV2UserPreferences();
	const folderKey = parseSidebarFolderKey(section.id);
	const onHide = folderKey
		? () => setTagFolderHidden(folderKey.projectId, folderKey.tag, true)
		: undefined;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: sortableId });

	const hasColor =
		section.color != null && section.color !== PROJECT_COLOR_DEFAULT;

	const handleSubmitRename = () => {
		const trimmed = renameValue.trim();
		if (trimmed) onRename(section.id, trimmed);
		setIsRenaming(false);
	};
	const startRename = useCallback(() => {
		setRenameValue(section.name);
		setIsRenaming(true);
	}, [section.name]);

	useEffect(() => {
		if (pendingRenameSectionId !== section.id) return;
		startRename();
		clearPendingSectionRename(section.id);
	}, [
		clearPendingSectionRename,
		pendingRenameSectionId,
		section.id,
		startRename,
	]);

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				// Fully hidden while dragging (the DragOverlay ghost is the drag
				// representation): the section pickup collapses the member rows,
				// which invalidates dnd-kit's cached initial rect for this node —
				// its in-list preview transform then points rows away from the
				// real drop slot. Displaced siblings still open the correct gap.
				opacity: isDragging ? 0 : undefined,
				borderLeft: hasColor
					? `2px solid ${section.color}`
					: "2px solid var(--color-border)",
			}}
		>
			<DashboardSidebarSectionContextMenu
				color={section.color}
				onRename={startRename}
				onSetColor={(color) => setSectionColor(section.id, color)}
				onDelete={() => onDelete(section.id)}
				onHide={onHide}
			>
				<DashboardSidebarGroupHeader
					label={
						isRenaming ? (
							<RenameInput
								value={renameValue}
								onChange={setRenameValue}
								onSubmit={handleSubmitRename}
								onCancel={() => {
									setRenameValue(section.name);
									setIsRenaming(false);
								}}
								className="-ml-1 h-5 w-full min-w-0 border-none bg-transparent px-1 py-0 text-[13px] font-medium text-muted-foreground outline-none"
							/>
						) : (
							<span className="truncate">{section.name}</span>
						)
					}
					isCollapsed={section.isCollapsed}
					isEditing={isRenaming}
					isDraggable
					onToggleCollapse={() => onToggleCollapse(section.id)}
					actions={
						<DashboardSidebarSectionActionsDropdown
							color={section.color}
							onRename={startRename}
							onSetColor={(color) => setSectionColor(section.id, color)}
							onDelete={() => onDelete(section.id)}
							onHide={onHide}
						/>
					}
					{...attributes}
					{...listeners}
				/>
			</DashboardSidebarSectionContextMenu>
		</div>
	);
}
