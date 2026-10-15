import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@superset/ui/utils";
import { memo, useMemo, useState } from "react";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import { getBlockedDragProps } from "../../../../hooks/useBlockedDragNotice";
import { useDashboardSidebarDnd } from "../../../../hooks/useSidebarDnd";
import type { DashboardSidebarProject } from "../../../../types";
import { DashboardSidebarProjectSection } from "../../../DashboardSidebarProjectSection";

interface SortableProjectWrapperProps {
	project: DashboardSidebarProject;
	isCollapsed: boolean;
	isDragDisabled: boolean;
	/** The Projects-list section it is filed under; shows its accent bar. */
	sectionId: string | null;
	sectionColor: string | null;
	/** Its section is collapsed: zero height, content unmounted once closed. */
	isHiddenBySection: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: (projectId: string) => void;
}

export const SortableProjectWrapper = memo(function SortableProjectWrapper({
	project,
	isCollapsed,
	isDragDisabled,
	sectionId,
	sectionColor,
	isHiddenBySection,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onToggleCollapse,
}: SortableProjectWrapperProps) {
	const { activeType } = useDashboardSidebarDnd();
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: project.id,
		disabled: isDragDisabled || isHiddenBySection,
	});
	const isDraggingProject = activeType === "project";
	const [isContentClosed, setIsContentClosed] = useState(isHiddenBySection);
	if (!isHiddenBySection && isContentClosed) setIsContentClosed(false);

	// useSortable re-renders this wrapper on every pointer move of any drag in
	// the sidebar's DndContext; the project section subtree is expensive, so
	// keep it referentially stable while only the wrapper transform changes.
	const section = useMemo(
		() => (
			<DashboardSidebarProjectSection
				project={project}
				projectSectionId={sectionId}
				isSidebarCollapsed={isCollapsed}
				isDraggingProject={isDraggingProject}
				workspaceShortcutLabels={workspaceShortcutLabels}
				onWorkspaceHover={onWorkspaceHover}
				onToggleCollapse={onToggleCollapse}
				dragHandleListeners={listeners}
				dragHandleAttributes={attributes}
			/>
		),
		[
			project,
			sectionId,
			isCollapsed,
			isDraggingProject,
			workspaceShortcutLabels,
			onWorkspaceHover,
			onToggleCollapse,
			listeners,
			attributes,
		],
	);

	const hasSectionColor =
		sectionColor != null && sectionColor !== PROJECT_COLOR_DEFAULT;

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
				boxShadow:
					sectionId !== null && !isCollapsed
						? hasSectionColor
							? `inset 3px 0 ${sectionColor}`
							: "inset 2px 0 var(--color-border)"
						: undefined,
			}}
			className={cn(
				"grid transition-[grid-template-rows,opacity] duration-150 ease-out",
				isHiddenBySection
					? "grid-rows-[0fr] opacity-0"
					: "grid-rows-[1fr] opacity-100",
			)}
			inert={isHiddenBySection}
			onTransitionEnd={(event) => {
				if (event.target === event.currentTarget && isHiddenBySection) {
					setIsContentClosed(true);
				}
			}}
			{...getBlockedDragProps(isDragDisabled)}
		>
			<div className="min-h-0 overflow-hidden">
				{!isContentClosed && section}
			</div>
		</div>
	);
});
