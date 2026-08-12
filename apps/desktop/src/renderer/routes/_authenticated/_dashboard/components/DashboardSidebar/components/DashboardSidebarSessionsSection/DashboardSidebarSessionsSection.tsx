import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import { useOpenNewSessionModal } from "renderer/stores/new-workspace-modal";
import {
	dropZoneId,
	parseId,
	SESSIONS_CONTAINER,
	useDashboardSidebarDnd,
} from "../../hooks/useSidebarDnd";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";
import { SidebarDropZone } from "../SidebarDropZone";
import { SortableWorkspaceItem } from "../SortableWorkspaceItem";

interface DashboardSidebarSessionsSectionProps {
	sessionWorkspaces: DashboardSidebarWorkspace[];
	isCollapsed?: boolean;
	/** The workspaces-list collapse toggle hides rows; the header stays. */
	rowsHidden?: boolean;
	workspaceShortcutLabels?: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

/**
 * Top-level "Sessions" section, rendered above the Projects header. The
 * header (and its "+", which opens the create surface with "No project"
 * preselected) always renders in expanded mode — like the Projects header —
 * so sessions stay discoverable at zero. Expanded rows are sortable: sessions
 * reorder among themselves, can be dragged into the Pinned section (pin), and
 * a pinned session dragged back here unpins. Collapsed rail renders a plain
 * icon stack with a trailing divider, matching the Pinned section.
 */
export function DashboardSidebarSessionsSection({
	sessionWorkspaces,
	isCollapsed = false,
	rowsHidden = false,
	workspaceShortcutLabels,
	onWorkspaceHover,
}: DashboardSidebarSessionsSectionProps) {
	const openNewSessionModal = useOpenNewSessionModal();
	const { sessionItems, workspacesById, activeWorkspaceHome } =
		useDashboardSidebarDnd();
	// Only a project-less session may land here, and only when there are no
	// rows to target directly.
	const dropZoneEligible =
		!isCollapsed &&
		!rowsHidden &&
		sessionItems.length === 0 &&
		activeWorkspaceHome === SESSIONS_CONTAINER;

	if (isCollapsed) {
		if (sessionWorkspaces.length === 0) return null;
		return (
			<div className="flex flex-col gap-0.5 py-1">
				{sessionWorkspaces.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						isInSection={false}
						onHoverCardOpen={onWorkspaceHover}
					/>
				))}
				<div className="mx-3 mt-1 border-b border-border" />
			</div>
		);
	}

	return (
		<div className="pb-1">
			{/* Header styled to match the Projects header below it. */}
			<div className="flex min-h-8 w-full shrink-0 items-center gap-1.5 py-1.5 pl-4 pr-2 text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
				<span className="min-w-0 truncate text-left">Sessions</span>
				<div className="min-w-0 flex-1" />
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="New session"
							onClick={openNewSessionModal}
							className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<LuPlus className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">New session</TooltipContent>
				</Tooltip>
			</div>
			{!rowsHidden && (
				<SortableContext
					items={sessionItems}
					strategy={verticalListSortingStrategy}
				>
					{sessionItems.map((id) => {
						const parsed = parseId(id);
						if (!parsed || parsed.type !== "workspace") return null;
						const workspace = workspacesById.get(parsed.realId);
						if (!workspace) return null;
						return (
							<SortableWorkspaceItem
								key={String(id)}
								sortableId={String(id)}
								workspace={workspace}
								shortcutLabel={workspaceShortcutLabels?.get(parsed.realId)}
								onHoverCardOpen={onWorkspaceHover}
							/>
						);
					})}
				</SortableContext>
			)}
			{dropZoneEligible && (
				<SidebarDropZone
					dropZoneId={dropZoneId(SESSIONS_CONTAINER)}
					label="Drop to unpin"
				/>
			)}
		</div>
	);
}
