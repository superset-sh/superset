import { useLingui } from "@lingui/react/macro";
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import {
	SidebarCardSlot,
	useHiringCard,
	usePaymentFailedCard,
	useStarNagCard,
} from "renderer/components/SidebarCardSlot";
import { UpdatesPill } from "renderer/components/UpdatesPill";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { authClient } from "renderer/lib/auth-client";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import {
	EMPTY_CLOUD_SIDEBAR,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { isInCloudSidebar } from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import {
	type ActiveWorkspaceSwitcherOption,
	DashboardSidebarActiveWorkspaceSwitcher,
} from "./components/DashboardSidebarActiveWorkspaceSwitcher";
import { DashboardSidebarBulkActions } from "./components/DashboardSidebarBulkActions";
import { DashboardSidebarBulkDeleteMount } from "./components/DashboardSidebarBulkDeleteMount";
import { DashboardSidebarCloudSection } from "./components/DashboardSidebarCloudSection";
import { DashboardSidebarGithubNotice } from "./components/DashboardSidebarGithubNotice";
import { DashboardSidebarHeader } from "./components/DashboardSidebarHeader";
import { DashboardSidebarHiddenProjects } from "./components/DashboardSidebarHiddenProjects";
import { DashboardSidebarHoverCardOverlay } from "./components/DashboardSidebarHoverCardOverlay";
import { DashboardSidebarPinnedSection } from "./components/DashboardSidebarPinnedSection";
import { DashboardSidebarProjectLane } from "./components/DashboardSidebarProjectLane";
import { DashboardSidebarSectionRenameProvider } from "./components/DashboardSidebarSectionRenameContext";
import { DashboardSidebarSessionsSection } from "./components/DashboardSidebarSessionsSection";
import { DashboardSidebarWorkspacesHeader } from "./components/DashboardSidebarWorkspacesHeader";
import { useGettingStartedCard } from "./components/GettingStartedCard";
import { useV2SetupScriptCard } from "./components/V2SetupScriptCard";
import { useBlockedDragNotice } from "./hooks/useBlockedDragNotice";
import { useDashboardSidebarData } from "./hooks/useDashboardSidebarData";
import { useDashboardSidebarShortcuts } from "./hooks/useDashboardSidebarShortcuts";
import { useMigrateLegacySidebarFolders } from "./hooks/useMigrateLegacySidebarFolders";
import { useProjectSidebarSections } from "./hooks/useProjectSidebarSections";
import { DashboardSidebarDndProvider } from "./providers/DashboardSidebarDndProvider";
import { DashboardSidebarHoverProvider } from "./providers/DashboardSidebarHoverProvider";
import { DashboardSidebarSelectionProvider } from "./providers/DashboardSidebarSelectionProvider";
import {
	DashboardSidebarWorkspaceStatusProvider,
	type SidebarStatusWorkspaceRef,
} from "./providers/DashboardSidebarWorkspaceStatusProvider";
import { ProjectSidebarSectionsProvider } from "./providers/ProjectSidebarSectionsProvider";
import type { DashboardSidebarWorkspace } from "./types";
import { filterDashboardSidebarProjects } from "./utils/filterDashboardSidebarProjects";
import { getProjectChildrenWorkspaces } from "./utils/projectChildren";
import { buildProjectSidebarLane } from "./utils/projectSidebarLane";
import { sortDashboardSidebarProjects } from "./utils/sortDashboardSidebarProjects";

interface DashboardSidebarProps {
	isCollapsed?: boolean;
}

export function DashboardSidebar({
	isCollapsed = false,
}: DashboardSidebarProps) {
	const { t } = useLingui();
	const {
		groups,
		projectSections,
		projectPlacements,
		hiddenProjects,
		pinnedWorkspaces,
		sessionWorkspaces,
		sessionChildren,
		githubStatus,
		refreshWorkspacePullRequest,
		toggleProjectCollapsed,
	} = useDashboardSidebarData();
	const {
		deleteSection,
		renameSection,
		setProjectHidden,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();
	const { commitProjectLane, revealProject } = useProjectSidebarSections();
	const showHiddenProject = useCallback(
		(projectId: string) => setProjectHidden(projectId, false),
		[setProjectHidden],
	);
	// Converts legacy uuid-keyed folders to tag-backed folders in the
	// background; retries whenever the workspace cache changes.
	useMigrateLegacySidebarFolders();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const settingsHotkey = useHotkeyDisplay("OPEN_SETTINGS").text;
	const isSettingsOpen = !!matchRoute({ to: "/settings", fuzzy: true });
	const { activeHostUrl } = useLocalHostService();
	const v2RouteMatch = matchRoute({ to: "/v2-workspace/$workspaceId" });
	const activeV2WorkspaceId = v2RouteMatch ? v2RouteMatch.workspaceId : null;
	const workspacesListCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.workspaces,
	);
	const { preferences, setSidebarProjectSortMode } = useV2UserPreferences();
	const sortMode = preferences.sidebarProjectSortMode;
	const [projectFilterQuery, setProjectFilterQuery] = useState("");
	// The icon rail hides the Projects header (and its filter input); a
	// filter left active there would invisibly hide projects.
	useEffect(() => {
		if (isCollapsed) setProjectFilterQuery("");
	}, [isCollapsed]);

	// Sort, then filter, as derived views: `groups` and the persisted tabOrder
	// stay untouched, so Manual restores the drag order exactly.
	const sortedGroups = useMemo(
		() =>
			sortMode === "manual"
				? groups
				: sortDashboardSidebarProjects(groups, sortMode),
		[sortMode, groups],
	);
	const trimmedFilterQuery = projectFilterQuery.trim();
	const isFilterActive = trimmedFilterQuery !== "";
	const displayedGroups = useMemo(
		() => filterDashboardSidebarProjects(sortedGroups, projectFilterQuery),
		[sortedGroups, projectFilterQuery],
	);
	// Projects in the order the list shows them, sections included.
	const sortedLane = useMemo(
		() =>
			buildProjectSidebarLane({
				projects: sortedGroups,
				sections: projectSections,
				placements: projectPlacements,
			}),
		[sortedGroups, projectSections, projectPlacements],
	);
	const displayedLane = useMemo(
		() =>
			buildProjectSidebarLane({
				projects: displayedGroups,
				sections: projectSections,
				placements: projectPlacements,
				hideEmptySections: isFilterActive,
			}),
		[displayedGroups, projectSections, projectPlacements, isFilterActive],
	);
	const laneSortedGroups = useMemo(
		() =>
			sortedLane.flatMap((item) =>
				item.type === "project" ? [item.project] : [],
			),
		[sortedLane],
	);
	// The sort modes only reorder rows inside a project, so the project list
	// is still the manual order and stays draggable; only a filter, which
	// hides projects outright, makes a project drop unsafe to commit.
	const isProjectDragDisabled = isFilterActive;
	const isChildDragDisabled = sortMode !== "manual" || isFilterActive;
	useBlockedDragNotice({
		reason: isFilterActive ? "filter" : sortMode !== "manual" ? "sort" : null,
		onSwitchToManualOrder: () => setSidebarProjectSortMode("manual"),
		onClearFilter: () => setProjectFilterQuery(""),
	});

	// Sorted but unfiltered, so ⌘1–⌘9 targets stay put while typing a query.
	// The filtered view expands matches through derived objects, so a jump
	// must not toggle the persisted collapse state while it is active.
	const workspaceShortcutLabels = useDashboardSidebarShortcuts(
		laneSortedGroups,
		sessionWorkspaces,
		sessionChildren,
		{ revealCollapsed: !isFilterActive, pinnedWorkspaces, revealProject },
	);
	// Scoped to what the filter actually shows — select-all and range-select
	// must not reach rows the filter is hiding.
	const selectableWorkspaceIds = useMemo(() => {
		const ids = new Set<string>();
		const addWorkspace = (workspace: DashboardSidebarWorkspace) => {
			if (
				workspace.type === "worktree" &&
				workspace.pendingTransaction?.type !== "insert"
			) {
				ids.add(workspace.id);
			}
		};
		for (const project of displayedGroups) {
			for (const child of project.children) {
				if (child.type === "workspace") {
					addWorkspace(child.workspace);
					continue;
				}
				// Members of collapsed groups are hidden and unclickable; keeping
				// them selected would leave invisible rows armed for bulk actions
				// (including Delete), so collapsing prunes them from the selection.
				if (child.section.isCollapsed) continue;
				for (const workspace of child.section.workspaces) {
					addWorkspace(workspace);
				}
			}
		}
		return ids;
	}, [displayedGroups]);

	// Every workspace the sidebar can render (pinned, sessions, project rows) —
	// the status provider fans out bindings queries and event subscriptions for
	// these once, instead of per row. Deliberately unfiltered so subscriptions
	// don't churn per keystroke.
	const { workspaces: cloudWorkspaces, isFresh: isCloudListFresh } =
		useCloudWorkspaces();
	const pruneWorkspaceSeen = useV2NotificationStore(
		(state) => state.pruneWorkspaceSeen,
	);
	useEffect(() => {
		if (!cloudWorkspaces || !isCloudListFresh) return;
		const live = new Set(cloudWorkspaces.map((cloud) => cloud.id));
		for (const id of Object.keys(
			useV2NotificationStore.getState().workspaceSeenAt,
		)) {
			if (!live.has(id)) pruneWorkspaceSeen(id);
		}
	}, [cloudWorkspaces, isCloudListFresh, pruneWorkspaceSeen]);

	const statusWorkspaces = useMemo<SidebarStatusWorkspaceRef[]>(() => {
		const byId = new Map<string, SidebarStatusWorkspaceRef>();
		for (const workspace of pinnedWorkspaces) {
			byId.set(workspace.id, { id: workspace.id, hostId: workspace.hostId });
		}
		for (const workspace of sessionWorkspaces) {
			byId.set(workspace.id, { id: workspace.id, hostId: workspace.hostId });
		}
		for (const project of groups) {
			for (const workspace of getProjectChildrenWorkspaces(project.children)) {
				byId.set(workspace.id, { id: workspace.id, hostId: workspace.hostId });
			}
		}
		for (const cloud of cloudWorkspaces ?? []) {
			byId.set(cloud.id, {
				id: cloud.id,
				hostId: cloud.id,
				reportedStatus: cloud.agentStatus ?? null,
				reportedAt: cloud.agentStatusAt?.getTime() ?? null,
			});
		}
		return [...byId.values()];
	}, [pinnedWorkspaces, sessionWorkspaces, groups, cloudWorkspaces]);

	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const organizationId = useActiveOrganizationId();
	const cloudSidebarEntries = useCloudSidebarStore((state) =>
		organizationId
			? (state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR).entries
			: EMPTY_CLOUD_SIDEBAR.entries,
	);
	const switcherWorkspaces = useMemo<ActiveWorkspaceSwitcherOption[]>(() => {
		const byId = new Map<string, ActiveWorkspaceSwitcherOption>();
		for (const workspace of pinnedWorkspaces) {
			byId.set(workspace.id, {
				id: workspace.id,
				name: workspace.name,
				detail: workspace.projectName,
			});
		}
		for (const workspace of sessionWorkspaces) {
			byId.set(workspace.id, {
				id: workspace.id,
				name: workspace.name,
				detail: null,
			});
		}
		for (const project of laneSortedGroups) {
			for (const workspace of getProjectChildrenWorkspaces(project.children)) {
				byId.set(workspace.id, {
					id: workspace.id,
					name: workspace.name,
					detail: project.name,
				});
			}
		}
		for (const cloud of cloudWorkspaces ?? []) {
			if (!isInCloudSidebar(cloud, cloudSidebarEntries[cloud.id], userId))
				continue;
			byId.set(cloud.id, { id: cloud.id, name: cloud.name, detail: null });
		}
		return [...byId.values()];
	}, [
		pinnedWorkspaces,
		sessionWorkspaces,
		laneSortedGroups,
		cloudWorkspaces,
		userId,
		cloudSidebarEntries,
	]);

	const activeV2Project = useMemo(() => {
		if (!activeV2WorkspaceId) return null;
		// A pinned active workspace renders outside its project group, so
		// resolve its project by id instead.
		const pinned = pinnedWorkspaces.find(
			(workspace) => workspace.id === activeV2WorkspaceId,
		);
		if (pinned) {
			return groups.find((project) => project.id === pinned.projectId) ?? null;
		}
		for (const project of groups) {
			for (const child of project.children) {
				if (
					child.type === "workspace" &&
					child.workspace.id === activeV2WorkspaceId
				) {
					return project;
				}
				if (child.type === "section") {
					for (const ws of child.section.workspaces) {
						if (ws.id === activeV2WorkspaceId) return project;
					}
				}
			}
		}
		return null;
	}, [groups, pinnedWorkspaces, activeV2WorkspaceId]);

	// Ordered by priority for the single card slot below — blocking first,
	// then actionable, then nags.
	const paymentFailedCard = usePaymentFailedCard({ surface: "v2" });
	const setupScriptCard = useV2SetupScriptCard({
		hostUrl: activeHostUrl,
		projectId: activeV2Project?.id ?? null,
		projectName: activeV2Project?.name ?? null,
	});
	const gettingStartedCard = useGettingStartedCard();
	const starNagCard = useStarNagCard({ isCollapsed });
	const hiringCard = useHiringCard({ surface: "v2" });

	return (
		<DashboardSidebarSelectionProvider
			availableWorkspaceIds={selectableWorkspaceIds}
			activeWorkspaceId={activeV2WorkspaceId}
		>
			<DashboardSidebarBulkDeleteMount />
			<DashboardSidebarSectionRenameProvider>
				<ProjectSidebarSectionsProvider sections={projectSections}>
					<DashboardSidebarHoverProvider>
						<DashboardSidebarWorkspaceStatusProvider
							workspaces={statusWorkspaces}
							activeWorkspaceId={activeV2WorkspaceId}
						>
							<DashboardSidebarActiveWorkspaceSwitcher
								workspaces={switcherWorkspaces}
								activeWorkspaceId={activeV2WorkspaceId}
							/>
							{/* Port data comes from the single DashboardSidebarPortsProvider in the
						    dashboard layout, which wraps this sidebar. */}
							<DashboardSidebarHoverCardOverlay>
								<DashboardSidebarDndProvider
									projects={displayedGroups}
									pinnedWorkspaces={pinnedWorkspaces}
									sessionChildren={sessionChildren}
									isSidebarCollapsed={isCollapsed}
									workspaceShortcutLabels={workspaceShortcutLabels}
									projectLane={displayedLane}
									onCommitProjectLane={commitProjectLane}
									isProjectDragDisabled={isProjectDragDisabled}
									isChildDragDisabled={isChildDragDisabled}
								>
									<div className="flex h-full flex-col border-r border-border bg-sidebar dark:bg-muted/35">
										<DashboardSidebarHeader isCollapsed={isCollapsed} />

										<OverflowFadeContainer
											fadeEdges={["top", "bottom"]}
											className="flex-1 overflow-y-auto hide-scrollbar"
										>
											{(isCollapsed || !workspacesListCollapsed) && (
												<DashboardSidebarPinnedSection
													pinnedWorkspaces={pinnedWorkspaces}
													isCollapsed={isCollapsed}
													onWorkspaceHover={refreshWorkspacePullRequest}
												/>
											)}
											<DashboardSidebarCloudSection
												isCollapsed={isCollapsed}
												onWorkspaceHover={refreshWorkspacePullRequest}
											/>
											<DashboardSidebarSessionsSection
												sessionWorkspaces={sessionWorkspaces}
												isCollapsed={isCollapsed}
												workspaceShortcutLabels={workspaceShortcutLabels}
												onWorkspaceHover={refreshWorkspacePullRequest}
												onDeleteSection={deleteSection}
												onRenameSection={renameSection}
												onToggleSectionCollapse={toggleSectionCollapsed}
											/>
											{!isCollapsed && (
												<div className="mt-3 first:mt-0">
													<DashboardSidebarBulkActions projects={groups}>
														<DashboardSidebarWorkspacesHeader
															sortMode={sortMode}
															onSortModeChange={setSidebarProjectSortMode}
															filterQuery={projectFilterQuery}
															onFilterQueryChange={setProjectFilterQuery}
														/>
													</DashboardSidebarBulkActions>
												</div>
											)}
											{!isCollapsed && !workspacesListCollapsed && (
												<DashboardSidebarGithubNotice status={githubStatus} />
											)}
											{(isCollapsed || !workspacesListCollapsed) && (
												<DashboardSidebarProjectLane
													lane={displayedLane}
													isSidebarCollapsed={isCollapsed}
													isDragDisabled={isProjectDragDisabled}
													workspaceShortcutLabels={workspaceShortcutLabels}
													onWorkspaceHover={refreshWorkspacePullRequest}
													onToggleProjectCollapse={toggleProjectCollapsed}
												/>
											)}
											{!isCollapsed && !workspacesListCollapsed && (
												<DashboardSidebarHiddenProjects
													projects={hiddenProjects}
													onShow={showHiddenProject}
												/>
											)}
											{!isCollapsed &&
												isFilterActive &&
												displayedGroups.length === 0 && (
													<div className="select-text cursor-text px-4 py-2 text-xs text-muted-foreground">
														{t({
															message: `No projects match "${trimmedFilterQuery}"`,
														})}
													</div>
												)}
										</OverflowFadeContainer>
										<SidebarCardSlot
											isCollapsed={isCollapsed}
											entries={[
												paymentFailedCard,
												setupScriptCard,
												gettingStartedCard,
												starNagCard,
												hiringCard,
											]}
										/>
										<div
											className={cn(
												isCollapsed
													? "flex flex-col items-center gap-2 py-2"
													: "flex items-center gap-1 p-2",
											)}
										>
											{isCollapsed ? (
												<OrganizationDropdown variant="collapsed" />
											) : (
												<div className="min-w-0 flex-1">
													<OrganizationDropdown variant="expanded" />
												</div>
											)}

											<UpdatesPill isCollapsed={isCollapsed} />
											<Tooltip delayDuration={300}>
												<TooltipTrigger asChild>
													<button
														type="button"
														aria-label={t({
															message: "Settings",
														})}
														onClick={() =>
															navigate({ to: "/settings/account" })
														}
														className={cn(
															"flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
															isSettingsOpen
																? "bg-fill-selected text-muted-foreground"
																: "text-muted-foreground hover:bg-fill-hover",
														)}
													>
														<HiOutlineCog6Tooth className="size-3.5" />
													</button>
												</TooltipTrigger>
												<TooltipContent side={isCollapsed ? "right" : "top"}>
													{settingsHotkey !== "Unassigned"
														? t({
																message: `Settings (${settingsHotkey})`,
															})
														: t({
																message: "Settings",
															})}
												</TooltipContent>
											</Tooltip>
										</div>
									</div>
								</DashboardSidebarDndProvider>
							</DashboardSidebarHoverCardOverlay>
						</DashboardSidebarWorkspaceStatusProvider>
					</DashboardSidebarHoverProvider>
				</ProjectSidebarSectionsProvider>
			</DashboardSidebarSectionRenameProvider>
		</DashboardSidebarSelectionProvider>
	);
}
