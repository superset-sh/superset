import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { useOpenNewSessionModal } from "renderer/stores/new-workspace-modal";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import {
	dropZoneId,
	parseId,
	SESSIONS_CONTAINER,
	useDashboardSidebarDnd,
} from "../../hooks/useSidebarDnd";
import { useDashboardSidebarSelection } from "../../providers/DashboardSidebarSelectionProvider";
import type {
	DashboardSidebarSessionTagGroup as DashboardSidebarSessionTagGroupData,
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspaceIndentation,
} from "../../types";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";
import { WorkspaceBulkMenuScope } from "../DashboardSidebarWorkspaceItem/components/WorkspaceBulkMenuScope";
import { SidebarDropZone } from "../SidebarDropZone";
import { SortableWorkspaceItem } from "../SortableWorkspaceItem";
import { DashboardSidebarSessionTagGroup } from "./components/DashboardSidebarSessionTagGroup";

interface DashboardSidebarSessionsSectionProps {
	sessionWorkspaces: DashboardSidebarWorkspace[];
	ungroupedWorkspaces: DashboardSidebarWorkspace[];
	tagGroups: DashboardSidebarSessionTagGroupData[];
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
	ungroupedWorkspaces,
	tagGroups,
	isCollapsed = false,
	workspaceShortcutLabels,
	onWorkspaceHover,
}: DashboardSidebarSessionsSectionProps) {
	const { t } = useLingui();
	const [collapsedTagGroups, setCollapsedTagGroups] = useState<Set<string>>(
		() => new Set(),
	);
	const openNewSessionModal = useOpenNewSessionModal();
	const { sessionItems, activeWorkspaceHome, workspacesById } =
		useDashboardSidebarDnd();
	const { isWorkspaceSelected, selectWorkspaceFromEvent } =
		useDashboardSidebarSelection();
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
	const sortableIdByWorkspaceId = new Map(
		sessionItems.flatMap((id) => {
			const parsed = parseId(id);
			return parsed?.type === "workspace" ? [[parsed.realId, String(id)]] : [];
		}),
	);
	const visibleSessionWorkspaces = [
		...ungroupedWorkspaces,
		...tagGroups.flatMap((group) =>
			collapsedTagGroups.has(group.tag) ? [] : group.workspaces,
		),
	];
	const orderedWorkspaceIds = visibleSessionWorkspaces
		.filter((workspace) => workspace.pendingTransaction?.type !== "insert")
		.map((workspace) => workspace.id);
	const groupInfo = new Map(
		tagGroups.flatMap((group) =>
			group.workspaces.map(
				(workspace) => [workspace.id, { sectionId: group.tag }] as const,
			),
		),
	);
	const renderWorkspace = (
		workspace: DashboardSidebarWorkspace,
		indentation: DashboardSidebarWorkspaceIndentation,
		isInSection = false,
	) => {
		const sortableId = sortableIdByWorkspaceId.get(workspace.id);
		if (!sortableId) return null;
		const canBulkSelect = workspace.pendingTransaction?.type !== "insert";
		return (
			<SortableWorkspaceItem
				key={workspace.id}
				sortableId={sortableId}
				workspace={workspace}
				isInSection={isInSection}
				indentation={indentation}
				isSelected={canBulkSelect && isWorkspaceSelected(workspace.id)}
				onSelectionClick={
					canBulkSelect
						? (event) =>
								selectWorkspaceFromEvent(event, {
									workspaceId: workspace.id,
									projectId: "sessions",
									orderedWorkspaceIds,
								})
						: undefined
				}
				shortcutLabel={workspaceShortcutLabels?.get(workspace.id)}
				onHoverCardOpen={onWorkspaceHover}
			/>
		);
	};

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
				<WorkspaceBulkMenuScope
					projectId={null}
					workspacesById={workspacesById}
					groupInfo={groupInfo}
				>
					<SortableContext
						items={sessionItems}
						strategy={verticalListSortingStrategy}
					>
						{ungroupedWorkspaces.map((workspace) =>
							renderWorkspace(workspace, "top-level"),
						)}
						{tagGroups.map((group) => (
							<DashboardSidebarSessionTagGroup
								key={group.tag}
								tag={group.tag}
								isCollapsed={collapsedTagGroups.has(group.tag)}
								onToggleCollapse={() =>
									setCollapsedTagGroups((current) => {
										const next = new Set(current);
										if (next.has(group.tag)) next.delete(group.tag);
										else next.add(group.tag);
										return next;
									})
								}
							>
								{group.workspaces.map((workspace) =>
									renderWorkspace(workspace, "workspace", true),
								)}
							</DashboardSidebarSessionTagGroup>
						))}
					</SortableContext>
				</WorkspaceBulkMenuScope>
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
