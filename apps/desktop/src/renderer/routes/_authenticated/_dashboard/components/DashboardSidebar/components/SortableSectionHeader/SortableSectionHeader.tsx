import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useState } from "react";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import type { DashboardSidebarSection } from "../../types";
import {
	DashboardSidebarSectionActionsDropdown,
	DashboardSidebarSectionContextMenu,
} from "../DashboardSidebarSection/components/DashboardSidebarSectionContextMenu";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSection/components/DashboardSidebarSectionHeader";

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
				opacity: isDragging ? 0.5 : undefined,
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
			>
				<DashboardSidebarSectionHeader
					section={section}
					isRenaming={isRenaming}
					renameValue={renameValue}
					onRenameValueChange={setRenameValue}
					onSubmitRename={handleSubmitRename}
					onCancelRename={() => {
						setRenameValue(section.name);
						setIsRenaming(false);
					}}
					onToggleCollapse={() => onToggleCollapse(section.id)}
					actions={
						<DashboardSidebarSectionActionsDropdown
							color={section.color}
							onRename={startRename}
							onSetColor={(color) => setSectionColor(section.id, color)}
							onDelete={() => onDelete(section.id)}
						/>
					}
					{...attributes}
					{...listeners}
				/>
			</DashboardSidebarSectionContextMenu>
		</div>
	);
}
