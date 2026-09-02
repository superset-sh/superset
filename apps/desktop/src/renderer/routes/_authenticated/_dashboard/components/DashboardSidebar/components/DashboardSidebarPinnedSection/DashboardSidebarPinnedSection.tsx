import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
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
	// Captured once per drag, on the render where the drag flag flips — the
	// only render where "empty" still means "empty at pickup".
	// biome-ignore lint/correctness/useExhaustiveDependencies: pinnedItems is read at that moment on purpose
	const emptyAtPickup = useMemo(
		() => isDraggingWorkspace && pinnedItems.length === 0,
		[isDraggingWorkspace],
	);
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

	if (pinnedItems.length === 0 && !isDraggingWorkspace) return null;

	// With nothing pinned, the section must not appear in-flow at pickup:
	// mounting a header and drop zone above the dragged row shifts it under
	// the pointer, and when the sidebar has no scroll room for dnd-kit to
	// compensate the ghost sits that far off the cursor for the whole drag.
	// Float the target instead — zero height in the list, stuck to the top of
	// the scroller so it stays reachable however far the list is scrolled.
	// A drag that started with pins keeps the in-flow section even after its
	// last row transfers out, so the layout under the pointer holds still.
	if (pinnedItems.length === 0 && emptyAtPickup) {
		return (
			// -mb-3 cancels the `mt-3 first:mt-0` the next section gains once
			// it is no longer the scroller's first child — otherwise the float
			// still nudges the list by that margin.
			<div className="-mb-3 sticky top-0 z-20 h-0">
				<div className="bg-sidebar/90 py-1 backdrop-blur-sm dark:bg-muted/90">
					<SidebarDropZone
						dropZoneId={dropZoneId(PINNED_CONTAINER)}
						label={t({
							message: "Drop to pin",
						})}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ message: "Pinned" })}
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
						message: "Drop to pin",
					})}
				/>
			)}
		</div>
	);
}
