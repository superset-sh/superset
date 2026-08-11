import type { DashboardSidebarPinnedWorkspace } from "../../types";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

interface DashboardSidebarPinnedSectionProps {
	pinnedWorkspaces: DashboardSidebarPinnedWorkspace[];
	isCollapsed?: boolean;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

/**
 * Top-level "Pinned" section rendered above all project groups. Rows are
 * ordered by pin time ascending (new pins append at the bottom) and are
 * exempt from project grouping. The collapsed rail renders no section chrome
 * anywhere, so collapsed mode is a plain icon stack with a trailing divider.
 */
export function DashboardSidebarPinnedSection({
	pinnedWorkspaces,
	isCollapsed = false,
	onWorkspaceHover,
}: DashboardSidebarPinnedSectionProps) {
	if (pinnedWorkspaces.length === 0) return null;

	if (isCollapsed) {
		return (
			<div className="flex flex-col gap-0.5 py-1">
				{pinnedWorkspaces.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
					/>
				))}
				<div className="mx-3 mt-1 border-b border-border" />
			</div>
		);
	}

	return (
		<div className="mt-1 pb-3 first:mt-0">
			{/* Micro-label styled to match the PROJECTS header above the groups. */}
			<div className="flex min-h-8 items-center py-1.5 pl-4 pr-2 text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
				<span className="min-w-0 truncate">Pinned</span>
			</div>
			{pinnedWorkspaces.map((workspace) => (
				<DashboardSidebarWorkspaceItem
					key={workspace.id}
					workspace={workspace}
					pinnedContext={{
						projectName: workspace.projectName,
						projectIconUrl: workspace.projectIconUrl,
					}}
					onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
				/>
			))}
		</div>
	);
}
