import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLingui } from "@lingui/react/macro";
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import {
	SidebarCardSlot,
	useHiringCard,
	usePaymentFailedCard,
	useStarNagCard,
} from "renderer/components/SidebarCardSlot";
import { UpdatesPill } from "renderer/components/UpdatesPill";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarBulkActions } from "./components/DashboardSidebarBulkActions";
import { DashboardSidebarBulkDeleteMount } from "./components/DashboardSidebarBulkDeleteMount";
import { DashboardSidebarCloudSection } from "./components/DashboardSidebarCloudSection";
import { DashboardSidebarHeader } from "./components/DashboardSidebarHeader";
import { DashboardSidebarHiddenProjects } from "./components/DashboardSidebarHiddenProjects";
import { DashboardSidebarHoverCardOverlay } from "./components/DashboardSidebarHoverCardOverlay";
import { DashboardSidebarPinnedSection } from "./components/DashboardSidebarPinnedSection";
import { DashboardSidebarProjectSection } from "./components/DashboardSidebarProjectSection";
import { DashboardSidebarSectionRenameProvider } from "./components/DashboardSidebarSectionRenameContext";
import { DashboardSidebarSessionsSection } from "./components/DashboardSidebarSessionsSection";
import { DashboardSidebarWorkspacesHeader } from "./components/DashboardSidebarWorkspacesHeader";
import { useV2SetupScriptCard } from "./components/V2SetupScriptCard";
import { useDashboardSidebarData } from "./hooks/useDashboardSidebarData";
import { useDashboardSidebarShortcuts } from "./hooks/useDashboardSidebarShortcuts";
import { useMigrateLegacySidebarFolders } from "./hooks/useMigrateLegacySidebarFolders";
import { useDashboardSidebarDnd } from "./hooks/useSidebarDnd";
import { DashboardSidebarDndProvider } from "./providers/DashboardSidebarDndProvider";
import { DashboardSidebarHoverProvider } from "./providers/DashboardSidebarHoverProvider";
import { DashboardSidebarSelectionProvider } from "./providers/DashboardSidebarSelectionProvider";
import {
	DashboardSidebarWorkspaceStatusProvider,
	type SidebarStatusWorkspaceRef,
} from "./providers/DashboardSidebarWorkspaceStatusProvider";
import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "./types";
import { filterDashboardSidebarProjects } from "./utils/filterDashboardSidebarProjects";
import { getProjectChildrenWorkspaces } from "./utils/projectChildren";
import { sortDashboardSidebarProjects } from "./utils/sortDashboardSidebarProjects";

interface DashboardSidebarProps {
	isCollapsed?: boolean;
}

interface SortableProjectWrapperProps {
	project: DashboardSidebarProject;
	isCollapsed: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: (projectId: string) => void;
}

const SortableProjectWrapper = memo(function SortableProjectWrapper({
	project,
	isCollapsed,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onToggleCollapse,
}: SortableProjectWrapperProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: project.id });
	const { activeType } = useDashboardSidebarDnd();
	const isDraggingProject = activeType === "project";

	// useSortable re-renders this wrapper on every pointer move of any drag in
	// the sidebar's DndContext; the project section subtree is expensive, so
	// keep it referentially stable while only the wrapper transform changes.
	const section = useMemo(
		() => (
			<DashboardSidebarProjectSection
				project={project}
				isSidebarCollapsed={isCollapsed}
				isDraggingProject={isDraggingProject}
				workspaceShortcutLabels={workspaceShortcutLabels}
				onWorkspaceHover={onWorkspaceHover}
				onToggleCollapse={onToggleCollapse}
				dragHandleListeners={listeners}
				dragHandleAttributes={attributes}
			/>
		),
		[
			project,
			isCollapsed,
			isDraggingProject,
			workspaceShortcutLabels,
			onWorkspaceHover,
			onToggleCollapse,
			listeners,
			attributes,
		],
	);

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
		>
			{section}
		</div>
	);
});

export function DashboardSidebar({
	isCollapsed = false,
}: DashboardSidebarProps) {
	const { t } = useLingui();
	const {
		groups,
		hiddenProjects,
		pinnedWorkspaces,
		sessionWorkspaces,
		sessionChildren,
		refreshWorkspacePullRequest,
		toggleProjectCollapsed,
	} = useDashboardSidebarData();
	const {
		deleteSection,
		reorderProjects,
		renameSection,
		setProjectHidden,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();
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

	// Local project order — syncs from groups, updated on drag end
	const [projectOrder, setProjectOrder] = useState(() =>
		groups.map((p) => p.id),
	);
	useEffect(() => {
		setProjectOrder(groups.map((p) => p.id));
	}, [groups]);

	const orderedGroups = useMemo(() => {
		const byId = new Map(groups.map((g) => [g.id, g]));
		return projectOrder
			.map((id) => byId.get(id))
			.filter((g): g is DashboardSidebarProject => g != null);
	}, [groups, projectOrder]);

	// Sort, then filter, as derived views: `orderedGroups` and the persisted
	// tabOrder stay untouched, so Manual restores the drag order exactly.
	const sortedGroups = useMemo(
		() =>
			sortMode === "manual"
				? orderedGroups
				: sortDashboardSidebarProjects(orderedGroups, sortMode),
		[sortMode, orderedGroups],
	);
	const displayedGroups = useMemo(
		() => filterDashboardSidebarProjects(sortedGroups, projectFilterQuery),
		[sortedGroups, projectFilterQuery],
	);
	const displayedProjectIds = useMemo(
		() => displayedGroups.map((project) => project.id),
		[displayedGroups],
	);
	const trimmedFilterQuery = projectFilterQuery.trim();
	const isFilterActive = trimmedFilterQuery !== "";
	const isDragDisabled = sortMode !== "manual" || isFilterActive;

	// Sorted but unfiltered, so ⌘1–⌘9 targets stay put while typing a query.
	// The filtered view expands matches through derived objects, so a jump
	// must not toggle the persisted collapse state while it is active.
	const workspaceShortcutLabels = useDashboardSidebarShortcuts(
		sortedGroups,
		sessionWorkspaces,
		sessionChildren,
		{ revealCollapsed: !isFilterActive },
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
	const statusWorkspaces = useMemo<SidebarStatusWorkspaceRef[]>(() => {
		const byId = new Map<string, SidebarStatusWorkspaceRef>();
		for (const workspace of pinnedWorkspaces) {
			byId.set(workspace.id, { id: workspace.id, hostId: workspace.hostId });
		}
		for (const workspace of sessionWorkspaces) {
			byId.set(workspace.id, { id: workspace.id, hostId: workspace.hostId });
		}
		for (const project of orderedGroups) {
			for (const workspace of getProjectChildrenWorkspaces(project.children)) {
				byId.set(workspace.id, { id: workspace.id, hostId: workspace.hostId });
			}
		}
		return [...byId.values()];
	}, [pinnedWorkspaces, sessionWorkspaces, orderedGroups]);

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
	const starNagCard = useStarNagCard({ isCollapsed });
	const hiringCard = useHiringCard({ surface: "v2" });

	const handleReorderProjects = useCallback(
		(reordered: string[]) => {
			setProjectOrder(reordered);
			reorderProjects(reordered);
		},
		[reorderProjects],
	);

	return (
		<DashboardSidebarSelectionProvider
			availableWorkspaceIds={selectableWorkspaceIds}
			activeWorkspaceId={activeV2WorkspaceId}
		>
			<DashboardSidebarBulkDeleteMount />
			<DashboardSidebarSectionRenameProvider>
				<DashboardSidebarHoverProvider>
					<DashboardSidebarWorkspaceStatusProvider
						workspaces={statusWorkspaces}
						activeWorkspaceId={activeV2WorkspaceId}
					>
						{/* Port data comes from the single DashboardSidebarPortsProvider in the
						    dashboard layout, which wraps this sidebar. */}
						<DashboardSidebarHoverCardOverlay>
							<DashboardSidebarDndProvider
								projects={displayedGroups}
								pinnedWorkspaces={pinnedWorkspaces}
								sessionChildren={sessionChildren}
								isSidebarCollapsed={isCollapsed}
								workspaceShortcutLabels={workspaceShortcutLabels}
								onReorderProjects={handleReorderProjects}
								isDragDisabled={isDragDisabled}
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
												<DashboardSidebarBulkActions projects={orderedGroups}>
													<DashboardSidebarWorkspacesHeader
														sortMode={sortMode}
														onSortModeChange={setSidebarProjectSortMode}
														filterQuery={projectFilterQuery}
														onFilterQueryChange={setProjectFilterQuery}
													/>
												</DashboardSidebarBulkActions>
											</div>
										)}
										{(isCollapsed || !workspacesListCollapsed) && (
											<SortableContext
												items={displayedProjectIds}
												strategy={verticalListSortingStrategy}
											>
												{displayedGroups.map((project) => (
													<SortableProjectWrapper
														key={project.id}
														project={project}
														isCollapsed={isCollapsed}
														workspaceShortcutLabels={workspaceShortcutLabels}
														onWorkspaceHover={refreshWorkspacePullRequest}
														onToggleCollapse={toggleProjectCollapsed}
													/>
												))}
											</SortableContext>
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
													onClick={() => navigate({ to: "/settings/account" })}
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
			</DashboardSidebarSectionRenameProvider>
		</DashboardSidebarSelectionProvider>
	);
}
