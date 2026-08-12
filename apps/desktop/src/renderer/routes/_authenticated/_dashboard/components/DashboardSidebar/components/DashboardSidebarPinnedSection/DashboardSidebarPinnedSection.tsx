import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	dropZoneId,
	PINNED_CONTAINER,
	parseId,
	useDashboardSidebarDnd,
} from "../../hooks/useSidebarDnd";
import type { DashboardSidebarPinnedWorkspace } from "../../types";
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
 * the first pin can land. The collapsed rail renders no section chrome
 * anywhere, so collapsed mode is a plain icon stack with a trailing divider.
 */
export function DashboardSidebarPinnedSection({
	pinnedWorkspaces,
	isCollapsed = false,
	onWorkspaceHover,
}: DashboardSidebarPinnedSectionProps) {
	const { pinnedItems, workspacesById, projectsById, activeType } =
		useDashboardSidebarDnd();
	const isDraggingWorkspace = activeType === "workspace";

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
		<div className="mt-1 pb-3 first:mt-0">
			{/* Micro-label styled to match the PROJECTS header above the groups. */}
			<div className="flex min-h-8 items-center py-1.5 pl-4 pr-2 text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
				<span className="min-w-0 truncate">Pinned</span>
			</div>
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
							pinnedContext={{
								projectName: project?.name ?? null,
								projectIconUrl: project?.iconUrl ?? null,
							}}
							onHoverCardOpen={onWorkspaceHover}
						/>
					);
				})}
			</SortableContext>
			{pinnedItems.length === 0 && (
				<SidebarDropZone
					dropZoneId={dropZoneId(PINNED_CONTAINER)}
					label="Drop to pin"
				/>
			)}
		</div>
	);
}
