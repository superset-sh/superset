import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo } from "react";
import {
	isProjectSec,
	projectSecId,
	useDashboardSidebarDnd,
} from "../../hooks/useSidebarDnd";
import type { ProjectSidebarLaneItem } from "../../utils/projectSidebarLane";
import { SortableProjectSectionHeader } from "./components/SortableProjectSectionHeader";
import { SortableProjectWrapper } from "./components/SortableProjectWrapper";

interface DashboardSidebarProjectLaneProps {
	lane: ProjectSidebarLaneItem[];
	isSidebarCollapsed: boolean;
	isDragDisabled: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleProjectCollapse: (projectId: string) => void;
}

/**
 * The Projects list: section headers and projects as one sortable list. The
 * icon rail shows projects only, in the same order.
 */
export function DashboardSidebarProjectLane({
	lane,
	isSidebarCollapsed,
	isDragDisabled,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onToggleProjectCollapse,
}: DashboardSidebarProjectLaneProps) {
	const { projectLaneIds, projectLaneSortingStrategy } =
		useDashboardSidebarDnd();
	// Render in the drag model's order: right after a drop it runs ahead of
	// the props by a frame.
	const orderedItems = useMemo(() => {
		const itemsById = new Map(
			lane.map((item) => [
				item.type === "section"
					? projectSecId(item.section.id)
					: item.project.id,
				item,
			]),
		);
		return projectLaneIds.flatMap((id) => {
			const item = itemsById.get(String(id));
			return item ? [item] : [];
		});
	}, [lane, projectLaneIds]);
	const sortableIds = useMemo(
		() =>
			isSidebarCollapsed
				? projectLaneIds.filter((id) => !isProjectSec(id))
				: projectLaneIds,
		[isSidebarCollapsed, projectLaneIds],
	);

	return (
		<SortableContext
			items={sortableIds}
			strategy={
				isSidebarCollapsed
					? verticalListSortingStrategy
					: projectLaneSortingStrategy
			}
		>
			{orderedItems.map((item) => {
				if (item.type === "section") {
					return isSidebarCollapsed ? null : (
						<SortableProjectSectionHeader
							key={item.section.id}
							section={item.section}
							isDragDisabled={isDragDisabled}
						/>
					);
				}
				return (
					<SortableProjectWrapper
						key={item.project.id}
						project={item.project}
						isCollapsed={isSidebarCollapsed}
						isDragDisabled={isDragDisabled}
						sectionId={item.section?.id ?? null}
						sectionColor={item.section?.color ?? null}
						isHiddenBySection={
							!isSidebarCollapsed && (item.section?.isCollapsed ?? false)
						}
						workspaceShortcutLabels={workspaceShortcutLabels}
						onWorkspaceHover={onWorkspaceHover}
						onToggleCollapse={onToggleProjectCollapse}
					/>
				);
			})}
		</SortableContext>
	);
}
