import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import { useOpenNewSessionModal } from "renderer/stores/new-workspace-modal";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import {
	dropZoneId,
	SESSIONS_CONTAINER,
	useDashboardSidebarDnd,
} from "../../hooks/useSidebarDnd";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarExpandedProjectContent } from "../DashboardSidebarProjectSection/components/DashboardSidebarExpandedProjectContent";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";
import { SidebarDropZone } from "../SidebarDropZone";

interface DashboardSidebarSessionsSectionProps {
	/** Every session in render order; only the collapsed rail reads it. */
	sessionWorkspaces: DashboardSidebarWorkspace[];
	isCollapsed?: boolean;
	workspaceShortcutLabels?: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

/**
 * Top-level "Sessions" section, rendered above the Projects header. The
 * header (and its "+", which opens the create surface with "No project"
 * preselected) always renders in expanded mode — like the Projects header —
 * so sessions stay discoverable at zero, and toggles a persisted section
 * collapse that hides the rows. The rows are the Sessions DnD lane, rendered
 * by the same list as a project: sessions reorder, file into and out of tag
 * folders, folders drag as units, and rows cross into the Pinned section
 * (pin) and back (unpin). Collapsed rail renders a plain icon stack with a
 * trailing divider, matching the Pinned section.
 */
export function DashboardSidebarSessionsSection({
	sessionWorkspaces,
	isCollapsed = false,
	workspaceShortcutLabels = new Map(),
	onWorkspaceHover,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarSessionsSectionProps) {
	const { t } = useLingui();
	const openNewSessionModal = useOpenNewSessionModal();
	const { sessionItems, activeWorkspaceHome } = useDashboardSidebarDnd();
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.sessions,
	);
	// The expanded list owns its own drop zone; a collapsed section still
	// needs one so a pinned session can always land back home.
	const collapsedDropZoneEligible =
		!isCollapsed &&
		isSectionCollapsed &&
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
					message: "Sessions",
				})}
				section="sessions"
			>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({
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
						<Trans>New session</Trans>
					</TooltipContent>
				</Tooltip>
			</DashboardSidebarSectionHeader>
			<DashboardSidebarExpandedProjectContent
				containerId={SESSIONS_CONTAINER}
				projectId={null}
				isCollapsed={isSectionCollapsed}
				topLevelIndentation="top-level"
				groupedIndentation="workspace"
				workspaceShortcutLabels={workspaceShortcutLabels}
				onWorkspaceHover={onWorkspaceHover}
				onDeleteSection={onDeleteSection}
				onRenameSection={onRenameSection}
				onToggleSectionCollapse={onToggleSectionCollapse}
			/>
			{collapsedDropZoneEligible && (
				<SidebarDropZone
					dropZoneId={dropZoneId(SESSIONS_CONTAINER)}
					label={t({
						message: "Drop to unpin",
					})}
				/>
			)}
		</div>
	);
}
