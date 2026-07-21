import {
	closestCenter,
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
import { UpdatesPill } from "renderer/components/UpdatesPill";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useInlineWorkspacePortsEnabled } from "renderer/stores/inline-workspace-ports";
import { useSidebarWorkspacesCollapseStore } from "renderer/stores/sidebar-workspaces-collapse";
import { DashboardSidebarHeader } from "./components/DashboardSidebarHeader";
import { DashboardSidebarHoverCardOverlay } from "./components/DashboardSidebarHoverCardOverlay";
import { DashboardSidebarPortsList } from "./components/DashboardSidebarPortsList";
import { DashboardSidebarProjectSection } from "./components/DashboardSidebarProjectSection";
import { DashboardSidebarSectionRenameProvider } from "./components/DashboardSidebarSectionRenameContext";
import { DashboardSidebarWorkspacesHeader } from "./components/DashboardSidebarWorkspacesHeader";
import { V2SetupScriptCard } from "./components/V2SetupScriptCard";
import { useDashboardSidebarData } from "./hooks/useDashboardSidebarData";
import { useDashboardSidebarShortcuts } from "./hooks/useDashboardSidebarShortcuts";
import { DashboardSidebarHoverProvider } from "./providers/DashboardSidebarHoverProvider";
import { DashboardSidebarPortsProvider } from "./providers/DashboardSidebarPortsProvider";
import type { DashboardSidebarProject } from "./types";

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
			/>
		</div>
	);
});

export function DashboardSidebar({
	isCollapsed = false,
}: DashboardSidebarProps) {
	const { groups, refreshWorkspacePullRequest, toggleProjectCollapsed } =
		useDashboardSidebarData();
	const { reorderProjects } = useDashboardSidebarState();
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

	const workspaceShortcutLabels = useDashboardSidebarShortcuts(orderedGroups);

	const activeV2Project = useMemo(() => {
		if (!activeV2WorkspaceId) return null;
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
	}, [groups, activeV2WorkspaceId]);

	const handleDragEnd = useCallback(
		({ active, over }: DragEndEvent) => {
			if (over && active.id !== over.id) {
				const oldIndex = projectOrder.indexOf(String(active.id));
				const newIndex = projectOrder.indexOf(String(over.id));
				if (oldIndex !== -1 && newIndex !== -1) {
					const reordered = arrayMove(projectOrder, oldIndex, newIndex);
					setProjectOrder(reordered);
					reorderProjects(reordered);
				}
			}
			setActiveProject(null);
		},
		[projectOrder, reorderProjects],
	);

	return (
		<DashboardSidebarSectionRenameProvider>
			<DashboardSidebarHoverProvider>
				<DashboardSidebarPortsProvider enabled={!isCollapsed}>
					<DashboardSidebarHoverCardOverlay>
						<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
							<DashboardSidebarHeader isCollapsed={isCollapsed} />

							{!isCollapsed && <DashboardSidebarWorkspacesHeader />}

							<OverflowFadeContainer
								fadeEdges={["top", "bottom"]}
								className="flex-1 overflow-y-auto hide-scrollbar"
							>
								{(isCollapsed || !workspacesListCollapsed) && (
									<DndContext
										sensors={sensors}
										collisionDetection={closestCenter}
										measuring={{
											droppable: { strategy: MeasuringStrategy.Always },
										}}
										onDragStart={({ active }) => {
											const project = groups.find((p) => p.id === active.id);
											setActiveProject(project ?? null);
										}}
										onDragEnd={handleDragEnd}
										onDragCancel={() => setActiveProject(null)}
									>
										<SortableContext
											items={projectOrder}
											strategy={verticalListSortingStrategy}
										>
											{orderedGroups.map((project) => (
												<SortableProjectWrapper
													key={project.id}
													project={project}
													isCollapsed={isCollapsed}
													isDraggingProject={activeProject != null}
													workspaceShortcutLabels={workspaceShortcutLabels}
													onWorkspaceHover={refreshWorkspacePullRequest}
													onToggleCollapse={toggleProjectCollapsed}
												/>
											))}
										</SortableContext>

										{createPortal(
											<DragOverlay dropAnimation={null}>
												{activeProject && (
													<div className="bg-background shadow-lg border-b border-border">
														<DashboardSidebarProjectSection
															project={activeProject}
															isSidebarCollapsed={isCollapsed}
															isDraggingProject
															workspaceShortcutLabels={workspaceShortcutLabels}
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
							<div
								className={cn(
									isCollapsed
										? "flex flex-col items-center gap-1 py-1"
										: "flex items-center gap-1 p-3",
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
													? "bg-accent text-foreground"
													: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
											)}
										>
											<HiOutlineCog6Tooth className="size-4" />
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
	);
}
