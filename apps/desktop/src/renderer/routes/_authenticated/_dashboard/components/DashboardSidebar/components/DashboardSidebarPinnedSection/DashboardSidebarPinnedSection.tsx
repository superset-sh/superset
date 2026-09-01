import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useLingui } from "@lingui/react/macro";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import {
	dropZoneId,
	PINNED_CONTAINER,
	parseId,
	useDashboardSidebarDnd,
} from "../../hooks/useSidebarDnd";
import type { DashboardSidebarPinnedWorkspace } from "../../types";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";
import { SidebarDropZone } from "../SidebarDropZone";
import { SortableWorkspaceItem } from "../SortableWorkspaceItem";

interface DashboardSidebarPinnedSectionProps {
	pinnedWorkspaces: DashboardSidebarPinnedWorkspace[];
	isCollapsed?: boolean;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

/**
 * Top-level "Pinned" section rendered above all project groups. Rows are
 * ordered by pin time ascending (new pins append at the bottom) and are
 * exempt from project grouping. Expanded rows are sortable and the section
 * accepts workspaces dragged in from project lists or Sessions (drop = pin);
 * while any workspace drag is active an empty section renders a drop zone so
 * the first pin can land. The header toggles a persisted section collapse that
 * hides the rows, exactly like the Projects header. The collapsed rail renders
 * no section chrome anywhere, so collapsed mode is a plain icon stack with a
 * trailing divider.
 */
export function DashboardSidebarPinnedSection({
	pinnedWorkspaces,
	isCollapsed = false,
	onWorkspaceHover,
}: DashboardSidebarPinnedSectionProps) {
	const { t } = useLingui();
	const { pinnedItems, workspacesById, projectsById, activeType } =
		useDashboardSidebarDnd();
	const isDraggingWorkspace = activeType === "workspace";
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.pinned,
	);

	if (isCollapsed) {
		if (pinnedWorkspaces.length === 0) return null;
		return (
			<div className="flex flex-col gap-0.5 py-1">
				{pinnedWorkspaces.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						onHoverCardOpen={onWorkspaceHover}
					/>
				))}
				<div className="mx-3 mt-1 border-b border-border" />
			</div>
		);
	}

	// Keep the section (and its drop targets) mounted through the whole drag,
	// even when the last pinned row is dragged out mid-drag.
	if (pinnedItems.length === 0 && !isDraggingWorkspace) return null;

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ id: "dashboard.sidebar.sectionPinned", message: "Pinned" })}
				section="pinned"
			/>
			{!isSectionCollapsed && (
				<SortableContext
					items={pinnedItems}
					strategy={verticalListSortingStrategy}
				>
					{pinnedItems.map((id) => {
						const parsed = parseId(id);
						if (!parsed || parsed.type !== "workspace") return null;
						const workspace = workspacesById.get(parsed.realId);
						if (!workspace) return null;
						const project = workspace.projectId
							? projectsById.get(workspace.projectId)
							: null;
						return (
							<SortableWorkspaceItem
								key={String(id)}
								sortableId={String(id)}
								workspace={workspace}
								indentation="top-level"
								pinnedContext={{
									projectName: project?.name ?? null,
									projectIconUrl: project?.iconUrl ?? null,
								}}
								onHoverCardOpen={onWorkspaceHover}
							/>
						);
					})}
				</SortableContext>
			)}
			{/* An empty section only stays mounted mid-drag; the drop zone renders
			    regardless of collapse so the first pin can always land. */}
			{pinnedItems.length === 0 && (
				<SidebarDropZone
					dropZoneId={dropZoneId(PINNED_CONTAINER)}
					label={t({
						id: "dashboard.sidebar.pinnedSection.dropToPin",
						message: "Drop to pin",
					})}
				/>
			)}
		</div>
	);
}
