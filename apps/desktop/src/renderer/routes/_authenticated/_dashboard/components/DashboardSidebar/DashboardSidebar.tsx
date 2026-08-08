import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	KeyboardSensor,
	MeasuringStrategy,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import { HiringBanner } from "renderer/components/HiringBanner";
import { UpdatesPill } from "renderer/components/UpdatesPill";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useInlineWorkspacePortsEnabled } from "renderer/stores/inline-workspace-ports";
import { useSidebarWorkspacesCollapseStore } from "renderer/stores/sidebar-workspaces-collapse";
import { DashboardSidebarBulkActions } from "./components/DashboardSidebarBulkActions";
import { DashboardSidebarFolderProvider } from "./components/DashboardSidebarFolderContext";
import { DashboardSidebarFolderHeader } from "./components/DashboardSidebarFolderHeader";
import { DashboardSidebarHeader } from "./components/DashboardSidebarHeader";
import { DashboardSidebarHoverCardOverlay } from "./components/DashboardSidebarHoverCardOverlay";
import { DashboardSidebarPinnedSection } from "./components/DashboardSidebarPinnedSection";
import { DashboardSidebarPortsList } from "./components/DashboardSidebarPortsList";
import { DashboardSidebarProjectSection } from "./components/DashboardSidebarProjectSection";
import { DashboardSidebarSectionRenameProvider } from "./components/DashboardSidebarSectionRenameContext";
import { DashboardSidebarWorkspacesHeader } from "./components/DashboardSidebarWorkspacesHeader";
import { FolderContents } from "./components/FolderContents";
import { RootDropZone } from "./components/RootDropZone";
import { V2SetupScriptCard } from "./components/V2SetupScriptCard";
import { useDashboardSidebarData } from "./hooks/useDashboardSidebarData";
import { useDashboardSidebarShortcuts } from "./hooks/useDashboardSidebarShortcuts";
import { DashboardSidebarHoverProvider } from "./providers/DashboardSidebarHoverProvider";
import { DashboardSidebarPortsProvider } from "./providers/DashboardSidebarPortsProvider";
import {
	DashboardSidebarSelectionProvider,
	useDashboardSidebarSelection,
} from "./providers/DashboardSidebarSelectionProvider";
import type { DashboardSidebarProject } from "./types";
import {
	folderAwareCollisionDetection,
	parseFolderDropId,
} from "./utils/folderDnd";
import { groupProjectsByFolder } from "./utils/groupProjectsByFolder";
import { getProjectChildrenWorkspaces } from "./utils/projectChildren";

interface DashboardSidebarProps {
	isCollapsed?: boolean;
}

interface SortableProjectWrapperProps {
	project: DashboardSidebarProject;
	isCollapsed: boolean;
	isDraggingProject: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: (projectId: string) => void;
}

const SortableProjectWrapper = memo(function SortableProjectWrapper({
	project,
	isCollapsed,
	isDraggingProject,
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
	const { isProjectSelected, selectProjectFromEvent } =
		useDashboardSidebarSelection();

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
		>
			<DashboardSidebarProjectSection
				project={project}
				isSidebarCollapsed={isCollapsed}
				isDraggingProject={isDraggingProject}
				workspaceShortcutLabels={workspaceShortcutLabels}
				onWorkspaceHover={onWorkspaceHover}
				onToggleCollapse={onToggleCollapse}
				dragHandleListeners={listeners}
				dragHandleAttributes={attributes}
				isSelected={isProjectSelected(project.id)}
				onSelectionClick={(event) => selectProjectFromEvent(event, project.id)}
			/>
		</div>
	);
});

export function DashboardSidebar({
	isCollapsed = false,
}: DashboardSidebarProps) {
	const {
		groups,
		folders,
		pinnedWorkspaces,
		refreshWorkspacePullRequest,
		toggleProjectCollapsed,
	} = useDashboardSidebarData();
	const {
		reorderProjects,
		createFolder,
		deleteFolder,
		moveProjectToFolder,
		renameFolder,
		setFolderColor,
		setFolderIcon,
		toggleFolderCollapsed,
	} = useDashboardSidebarState();

	// Folder created from a project's context menu enters rename mode on mount.
	const [autoRenameFolderId, setAutoRenameFolderId] = useState<string | null>(
		null,
	);

	const createFolderForProjects = useCallback(
		(projectIds: string[]) => {
			if (projectIds.length === 0) return;
			const folderId = createFolder();
			for (const projectId of projectIds) {
				moveProjectToFolder(projectId, folderId);
			}
			setAutoRenameFolderId(folderId);
		},
		[createFolder, moveProjectToFolder],
	);

	const createFolderForProject = useCallback(
		(projectId: string) => createFolderForProjects([projectId]),
		[createFolderForProjects],
	);

	// "New project folder" from the PROJECTS header: create an empty folder and
	// drop straight into rename, so it can be created before any project exists.
	const handleNewFolder = useCallback(() => {
		const folderId = createFolder();
		setAutoRenameFolderId(folderId);
	}, [createFolder]);

	const folderContextValue = useMemo(
		() => ({
			folders,
			moveProjectToFolder,
			createFolderForProject,
			createFolderForProjects,
		}),
		[
			folders,
			moveProjectToFolder,
			createFolderForProject,
			createFolderForProjects,
		],
	);
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const settingsHotkey = useHotkeyDisplay("OPEN_SETTINGS").text;
	const isSettingsOpen = !!matchRoute({ to: "/settings", fuzzy: true });
	const { activeHostUrl } = useLocalHostService();
	const inlineWorkspacePortsEnabled = useInlineWorkspacePortsEnabled();
	const v2RouteMatch = matchRoute({ to: "/v2-workspace/$workspaceId" });
	const activeV2WorkspaceId = v2RouteMatch ? v2RouteMatch.workspaceId : null;
	const workspacesListCollapsed = useSidebarWorkspacesCollapseStore(
		(s) => s.isCollapsed,
	);

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const [activeProject, setActiveProject] =
		useState<DashboardSidebarProject | null>(null);

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

	const { foldersWithProjects, ungroupedProjects } = useMemo(
		() => groupProjectsByFolder(folders, orderedGroups),
		[folders, orderedGroups],
	);

	// Live folder ids, for resolving a drag target whose folder was deleted.
	const folderIds = useMemo(
		() => new Set(folders.map((folder) => folder.id)),
		[folders],
	);

	// dnd-kit requires the SortableContext item order to match the rendered
	// order, so build it exactly as the list below renders: each folder's
	// projects (skipped while that folder is collapsed and therefore not
	// mounted), then the ungrouped ones.
	const sortableProjectIds = useMemo(
		() => [
			...foldersWithProjects.flatMap(({ folder, projects }) =>
				isCollapsed || !folder.isCollapsed
					? projects.map((project) => project.id)
					: [],
			),
			...ungroupedProjects.map((project) => project.id),
		],
		[foldersWithProjects, ungroupedProjects, isCollapsed],
	);

	const workspaceShortcutLabels = useDashboardSidebarShortcuts(orderedGroups);
	const selectableWorkspaceIds = useMemo(
		() =>
			new Set(
				orderedGroups.flatMap((project) =>
					getProjectChildrenWorkspaces(project.children)
						.filter(
							(workspace) =>
								workspace.type === "worktree" &&
								workspace.pendingTransaction?.type !== "insert",
						)
						.map((workspace) => workspace.id),
				),
			),
		[orderedGroups],
	);

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

	const handleDragEnd = useCallback(
		({ active, over }: DragEndEvent) => {
			if (over && active.id !== over.id) {
				const activeId = String(active.id);
				const overId = String(over.id);

				// Dropped on a folder header (or the root zone): re-parent only —
				// position within the destination is left to a follow-up drag.
				const dropFolderId = parseFolderDropId(overId);
				if (dropFolderId !== undefined) {
					const current = groups.find((project) => project.id === activeId);
					if (current && current.folderId !== dropFolderId) {
						moveProjectToFolder(activeId, dropFolderId);
					}
					setActiveProject(null);
					return;
				}

				// Dropped on another project: adopt that project's folder (so
				// dragging into a folder's list joins it) and reorder.
				const target = groups.find((project) => project.id === overId);
				const dragged = groups.find((project) => project.id === activeId);
				// A project whose folder no longer exists renders at the root but
				// still carries the dead id. Resolve against the live folder set,
				// or dropping onto it would move the dragged project into a folder
				// that isn't there instead of to the root it appears to be in.
				const targetFolderId =
					target?.folderId && folderIds.has(target.folderId)
						? target.folderId
						: null;
				if (target && dragged && dragged.folderId !== targetFolderId) {
					moveProjectToFolder(activeId, targetFolderId);
				}

				const oldIndex = projectOrder.indexOf(activeId);
				const newIndex = projectOrder.indexOf(overId);
				if (oldIndex !== -1 && newIndex !== -1) {
					const reordered = arrayMove(projectOrder, oldIndex, newIndex);
					setProjectOrder(reordered);
					reorderProjects(reordered);
				}
			}
			setActiveProject(null);
		},
		[projectOrder, reorderProjects, groups, moveProjectToFolder, folderIds],
	);

	return (
		<DashboardSidebarSelectionProvider
			availableWorkspaceIds={selectableWorkspaceIds}
			orderedProjectIds={sortableProjectIds}
		>
			<DashboardSidebarFolderProvider value={folderContextValue}>
				<DashboardSidebarSectionRenameProvider>
					<DashboardSidebarHoverProvider>
						<DashboardSidebarPortsProvider enabled={!isCollapsed}>
							<DashboardSidebarHoverCardOverlay>
								<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
									<DashboardSidebarHeader isCollapsed={isCollapsed} />

									{!isCollapsed && (
										<DashboardSidebarBulkActions projects={orderedGroups}>
											<DashboardSidebarWorkspacesHeader
												onNewFolder={handleNewFolder}
											/>
										</DashboardSidebarBulkActions>
									)}

									{/* Flex column so the RootDropZone can grow into the empty
									    space below the folders during a drag; children keep
									    their natural height so the list still scrolls. */}
									<OverflowFadeContainer
										fadeEdges={["top", "bottom"]}
										className="flex flex-1 flex-col overflow-y-auto hide-scrollbar [&>*]:shrink-0"
									>
										{(isCollapsed || !workspacesListCollapsed) && (
											<DashboardSidebarPinnedSection
												pinnedWorkspaces={pinnedWorkspaces}
												isCollapsed={isCollapsed}
												onWorkspaceHover={refreshWorkspacePullRequest}
											/>
										)}
										{(isCollapsed || !workspacesListCollapsed) && (
											<DndContext
												sensors={sensors}
												collisionDetection={folderAwareCollisionDetection}
												measuring={{
													droppable: { strategy: MeasuringStrategy.Always },
												}}
												onDragStart={({ active }) => {
													const project = groups.find(
														(p) => p.id === active.id,
													);
													setActiveProject(project ?? null);
												}}
												onDragEnd={handleDragEnd}
												onDragCancel={() => setActiveProject(null)}
											>
												<SortableContext
													items={sortableProjectIds}
													strategy={verticalListSortingStrategy}
												>
													{foldersWithProjects.map(({ folder, projects }) => (
														<div key={folder.id} className="mt-1 first:mt-0">
															{!isCollapsed && (
																<DashboardSidebarFolderHeader
																	folder={folder}
																	projectCount={projects.length}
																	autoRename={autoRenameFolderId === folder.id}
																	onAutoRenameEnd={() =>
																		setAutoRenameFolderId(null)
																	}
																	onToggleCollapse={toggleFolderCollapsed}
																	onRename={renameFolder}
																	onSetColor={setFolderColor}
																	onSetIcon={setFolderIcon}
																	onDelete={deleteFolder}
																/>
															)}
															{(isCollapsed || !folder.isCollapsed) && (
																<FolderContents
																	folder={folder}
																	isSidebarCollapsed={isCollapsed}
																>
																	{projects.map((project) => (
																		<SortableProjectWrapper
																			key={project.id}
																			project={project}
																			isCollapsed={isCollapsed}
																			isDraggingProject={activeProject != null}
																			workspaceShortcutLabels={
																				workspaceShortcutLabels
																			}
																			onWorkspaceHover={
																				refreshWorkspacePullRequest
																			}
																			onToggleCollapse={toggleProjectCollapsed}
																		/>
																	))}
																</FolderContents>
															)}
														</div>
													))}
													<RootDropZone isDragging={activeProject != null}>
														{ungroupedProjects.map((project) => (
															<SortableProjectWrapper
																key={project.id}
																project={project}
																isCollapsed={isCollapsed}
																isDraggingProject={activeProject != null}
																workspaceShortcutLabels={
																	workspaceShortcutLabels
																}
																onWorkspaceHover={refreshWorkspacePullRequest}
																onToggleCollapse={toggleProjectCollapsed}
															/>
														))}
													</RootDropZone>
												</SortableContext>

												{createPortal(
													<DragOverlay dropAnimation={null}>
														{activeProject && (
															// Transparent on purpose: the sidebar surface comes from
															// window vibrancy, so any opaque bg renders as a solid
															// slab. Sortable siblings make room, so the row floats
															// over empty sidebar, not over other rows.
															<div>
																<DashboardSidebarProjectSection
																	project={activeProject}
																	isSidebarCollapsed={isCollapsed}
																	isDraggingProject
																	workspaceShortcutLabels={
																		workspaceShortcutLabels
																	}
																	onWorkspaceHover={() => {}}
																	onToggleCollapse={() => {}}
																/>
															</div>
														)}
													</DragOverlay>,
													document.body,
												)}
											</DndContext>
										)}
									</OverflowFadeContainer>
									{!isCollapsed && !inlineWorkspacePortsEnabled && (
										<DashboardSidebarPortsList />
									)}
									{!isCollapsed && activeV2Project && activeHostUrl && (
										<V2SetupScriptCard
											hostUrl={activeHostUrl}
											projectId={activeV2Project.id}
											projectName={activeV2Project.name}
										/>
									)}
									<HiringBanner surface="v2" isCollapsed={isCollapsed} />
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
													aria-label="Settings"
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
													? `Settings (${settingsHotkey})`
													: "Settings"}
											</TooltipContent>
										</Tooltip>
									</div>
								</div>
							</DashboardSidebarHoverCardOverlay>
						</DashboardSidebarPortsProvider>
					</DashboardSidebarHoverProvider>
				</DashboardSidebarSectionRenameProvider>
			</DashboardSidebarFolderProvider>
		</DashboardSidebarSelectionProvider>
	);
}
