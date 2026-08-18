import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
} from "@dnd-kit/core";
import { type ReactNode, useCallback } from "react";
import { createPortal } from "react-dom";
import { DashboardSidebarProjectSection } from "../../components/DashboardSidebarProjectSection";
import { SidebarDragOverlay } from "../../components/SidebarDragOverlay";
import {
	SidebarDndContextProvider,
	useSidebarDnd,
} from "../../hooks/useSidebarDnd";
import type {
	DashboardSidebarPinnedWorkspace,
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../../types";
import { useDashboardSidebarHoverActions } from "../DashboardSidebarHoverProvider";

interface DashboardSidebarDndProviderProps {
	/** Projects in their current display order. */
	projects: DashboardSidebarProject[];
	pinnedWorkspaces: DashboardSidebarPinnedWorkspace[];
	sessionWorkspaces: DashboardSidebarWorkspace[];
	isSidebarCollapsed: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onReorderProjects: (projectIds: string[]) => void;
	children: ReactNode;
}

/**
 * Hosts the sidebar's single DndContext. Pinned rows, session rows, project
 * headers, and every project's workspace/section rows all register here, so
 * a workspace can be dragged across the pin boundary (pin, unpin, reorder)
 * while projects and sections keep their scoped reordering.
 */
export function DashboardSidebarDndProvider({
	projects,
	pinnedWorkspaces,
	sessionWorkspaces,
	isSidebarCollapsed,
	workspaceShortcutLabels,
	onReorderProjects,
	children,
}: DashboardSidebarDndProviderProps) {
	const {
		sensors,
		measuring,
		collisionDetection,
		activeItem,
		predictedColor,
		contextValue,
		handlers,
	} = useSidebarDnd({
		projects,
		pinnedWorkspaces,
		sessionWorkspaces,
		onReorderProjects,
	});

	// Dragging sweeps the pointer across rows, which would otherwise drive the
	// hover-card machine (state churn + PR refresh per row crossed, and a card
	// popping open under the drop point). Hold a hover suppression for the
	// drag's duration; dnd-kit pairs every start with exactly one end/cancel.
	const { beginHoverCardSuppression, endHoverCardSuppression, forceClose } =
		useDashboardSidebarHoverActions();
	// try/finally throughout: a throwing drag handler (e.g. a persistence
	// write) must not leak the counted suppression, or hover cards stay dead
	// until the sidebar remounts.
	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			forceClose();
			beginHoverCardSuppression();
			try {
				handlers.onDragStart(event);
			} catch (error) {
				// dnd-kit won't fire end/cancel for a start that threw.
				endHoverCardSuppression();
				throw error;
			}
		},
		[
			forceClose,
			beginHoverCardSuppression,
			endHoverCardSuppression,
			handlers.onDragStart,
		],
	);
	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			try {
				handlers.onDragEnd(event);
			} finally {
				endHoverCardSuppression();
			}
		},
		[endHoverCardSuppression, handlers.onDragEnd],
	);
	const handleDragCancel = useCallback(() => {
		try {
			handlers.onDragCancel();
		} finally {
			endHoverCardSuppression();
		}
	}, [endHoverCardSuppression, handlers.onDragCancel]);

	return (
		<SidebarDndContextProvider value={contextValue}>
			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				measuring={measuring}
				onDragStart={handleDragStart}
				onDragOver={handlers.onDragOver}
				onDragEnd={handleDragEnd}
				onDragCancel={handleDragCancel}
			>
				{children}

				{createPortal(
					<DragOverlay dropAnimation={null}>
						{/* Transparent on purpose (all branches): the sidebar surface
						    comes from window vibrancy, so any opaque bg renders as a
						    solid slab. Sortable siblings make room, so the row floats
						    over empty sidebar, not over other rows. */}
						{activeItem?.type === "project" ? (
							// The overlay clone's rows must not register sortables into
							// the live context (their ids already exist in the sidebar),
							// so isolate them in an inert nested DndContext.
							<DndContext>
								<div>
									<DashboardSidebarProjectSection
										project={activeItem.project}
										isSidebarCollapsed={isSidebarCollapsed}
										isDraggingProject
										workspaceShortcutLabels={workspaceShortcutLabels}
										onWorkspaceHover={() => {}}
										onToggleCollapse={() => {}}
									/>
								</div>
							</DndContext>
						) : activeItem ? (
							<SidebarDragOverlay
								activeItem={activeItem}
								accentColor={predictedColor}
							/>
						) : null}
					</DragOverlay>,
					document.body,
				)}
			</DndContext>
		</SidebarDndContextProvider>
	);
}
