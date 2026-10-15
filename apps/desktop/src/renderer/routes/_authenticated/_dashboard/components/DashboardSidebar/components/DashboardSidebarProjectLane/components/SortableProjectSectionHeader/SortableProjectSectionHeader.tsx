import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useState } from "react";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import { getBlockedDragProps } from "../../../../hooks/useBlockedDragNotice";
import { useProjectSidebarSections } from "../../../../hooks/useProjectSidebarSections";
import {
	projectSecId,
	useDashboardSidebarDnd,
} from "../../../../hooks/useSidebarDnd";
import type { ProjectSidebarSection } from "../../../../utils/projectSidebarLane";
import { DashboardSidebarGroupHeader } from "../../../DashboardSidebarGroupHeader";
import {
	DashboardSidebarSectionActionsDropdown,
	DashboardSidebarSectionContextMenu,
} from "../../../DashboardSidebarSectionContextMenu";
import { useDashboardSidebarSectionRename } from "../../../DashboardSidebarSectionRenameContext";

interface SortableProjectSectionHeaderProps {
	section: ProjectSidebarSection;
	isDragDisabled: boolean;
}

export function SortableProjectSectionHeader({
	section,
	isDragDisabled,
}: SortableProjectSectionHeaderProps) {
	const {
		deleteProjectSection,
		renameProjectSection,
		setProjectSectionColor,
		toggleProjectSectionCollapsed,
	} = useProjectSidebarSections();
	const { clearPendingSectionRename, pendingRenameSectionId } =
		useDashboardSidebarSectionRename();
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(section.name);
	const { activeType } = useDashboardSidebarDnd();
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
		isOver,
	} = useSortable({ id: projectSecId(section.id), disabled: isDragDisabled });
	const isDropTarget = isOver && activeType === "project";

	const startRename = useCallback(() => {
		setRenameValue(section.name);
		setIsRenaming(true);
	}, [section.name]);
	const submitRename = () => {
		renameProjectSection(section.id, renameValue);
		setIsRenaming(false);
	};
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

	const hasColor =
		section.color != null && section.color !== PROJECT_COLOR_DEFAULT;
	const setColor = (color: string | null) =>
		setProjectSectionColor(section.id, color);
	const remove = () => deleteProjectSection(section.id);

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
				boxShadow: hasColor
					? `inset 3px 0 ${section.color}`
					: "inset 2px 0 var(--color-border)",
			}}
			{...getBlockedDragProps(isDragDisabled)}
		>
			<DashboardSidebarSectionContextMenu
				noun="section"
				color={section.color}
				onRename={startRename}
				onSetColor={setColor}
				onDelete={remove}
			>
				<DashboardSidebarGroupHeader
					label={
						isRenaming ? (
							<RenameInput
								value={renameValue}
								onChange={setRenameValue}
								onSubmit={submitRename}
								onCancel={() => {
									setRenameValue(section.name);
									setIsRenaming(false);
								}}
								className="-ml-1 h-5 w-full min-w-0 border-none bg-transparent px-1 py-0 text-[13px] font-medium text-muted-foreground outline-none"
							/>
						) : (
							<>
								<span className="truncate">{section.name}</span>
								{section.isCollapsed && (
									<span className="shrink-0 text-[11px] font-normal tabular-nums text-muted-foreground/70">
										{section.projectCount}
									</span>
								)}
							</>
						)
					}
					isCollapsed={section.isCollapsed}
					isToggleDisabled={section.isCollapseLocked}
					isEditing={isRenaming}
					isDraggable={!isDragDisabled}
					indentation="top-level"
					className={cn(isDropTarget && "bg-fill-selected text-foreground")}
					onToggleCollapse={() => toggleProjectSectionCollapsed(section.id)}
					actions={
						<DashboardSidebarSectionActionsDropdown
							noun="section"
							color={section.color}
							onRename={startRename}
							onSetColor={setColor}
							onDelete={remove}
						/>
					}
					{...attributes}
					{...listeners}
				/>
			</DashboardSidebarSectionContextMenu>
		</div>
	);
}
