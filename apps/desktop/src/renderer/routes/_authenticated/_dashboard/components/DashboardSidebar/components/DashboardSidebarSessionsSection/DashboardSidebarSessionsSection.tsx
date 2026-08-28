import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import { useOpenNewSessionModal } from "renderer/stores/new-workspace-modal";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import {
	dropZoneId,
	parseId,
	SESSIONS_CONTAINER,
	useDashboardSidebarDnd,
} from "../../hooks/useSidebarDnd";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";
import { SidebarDropZone } from "../SidebarDropZone";
import { SortableWorkspaceItem } from "../SortableWorkspaceItem";

interface DashboardSidebarSessionsSectionProps {
	sessionWorkspaces: DashboardSidebarWorkspace[];
	isCollapsed?: boolean;
	workspaceShortcutLabels?: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

/**
 * Top-level "Sessions" section, rendered above the Projects header. The
 * header (and its "+", which opens the create surface with "No project"
 * preselected) always renders in expanded mode — like the Projects header —
 * so sessions stay discoverable at zero, and toggles a persisted section
 * collapse that hides the rows. Expanded rows are sortable: sessions
 * reorder among themselves, can be dragged into the Pinned section (pin), and
 * a pinned session dragged back here unpins. Collapsed rail renders a plain
 * icon stack with a trailing divider, matching the Pinned section.
 */
export function DashboardSidebarSessionsSection({
	sessionWorkspaces,
	isCollapsed = false,
	workspaceShortcutLabels,
	onWorkspaceHover,
}: DashboardSidebarSessionsSectionProps) {
	const { t } = useLingui();
	const openNewSessionModal = useOpenNewSessionModal();
	const { sessionItems, workspacesById, activeWorkspaceHome } =
		useDashboardSidebarDnd();
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.sessions,
	);
	// Only a project-less session may land here, and only when there are no
	// rows to target directly. An empty section has nothing to hide, so the
	// zone renders regardless of the section collapse.
	const dropZoneEligible =
		!isCollapsed &&
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
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({
					id: "dashboard.sidebar.sectionSessions",
					message: "Sessions",
				})}
				section="sessions"
			>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({
								id: "dashboard.sidebar.sessionsSection.newSessionAriaLabel",
								message: "New session",
							})}
							onClick={(event) => {
								event.stopPropagation();
								openNewSessionModal();
							}}
							onKeyDown={(event) => event.stopPropagation()}
							className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<LuPlus className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans id="dashboard.sidebar.sessionsSection.newSession">
							New session
						</Trans>
					</TooltipContent>
				</Tooltip>
			</DashboardSidebarSectionHeader>
			{!isSectionCollapsed && (
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
					label={t({
						id: "dashboard.sidebar.sessionsSection.dropToUnpin",
						message: "Drop to unpin",
					})}
				/>
			)}
		</div>
	);
}
