import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const DEFAULT_WORKSPACE_SIDEBAR_WIDTH = 280;
export const COLLAPSED_WORKSPACE_SIDEBAR_WIDTH = 52;
const MIN_WORKSPACE_SIDEBAR_WIDTH = 225;
export const MAX_WORKSPACE_SIDEBAR_WIDTH = 400;
export const WORKSPACE_SIDEBAR_STORAGE_KEY = "workspace-sidebar-store";

// Threshold for snapping to collapsed state
const COLLAPSE_THRESHOLD = 120;

interface WorkspaceSidebarState {
	width: number;
	lastExpandedWidth: number;
	// Use string[] instead of Set<string> for JSON serialization with Zustand persist
	collapsedProjectIds: string[];
	isResizing: boolean;

	setWidth: (width: number) => void;
	setIsResizing: (isResizing: boolean) => void;
	toggleProjectCollapsed: (projectId: string) => void;
	isProjectCollapsed: (projectId: string) => boolean;
	toggleCollapsed: () => void;
	isCollapsed: () => boolean;
}

export const useWorkspaceSidebarStore = create<WorkspaceSidebarState>()(
	devtools(
		persist(
			(set, get) => ({
				width: DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
				lastExpandedWidth: DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
				collapsedProjectIds: [],
				isResizing: false,

				setWidth: (width) => {
					if (width < COLLAPSE_THRESHOLD) {
						set({ width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH });
						return;
					}

					// Clamp to expanded range
					const clampedWidth = Math.max(
						MIN_WORKSPACE_SIDEBAR_WIDTH,
						Math.min(MAX_WORKSPACE_SIDEBAR_WIDTH, width),
					);

					set({
						width: clampedWidth,
						lastExpandedWidth: clampedWidth,
					});
				},

				setIsResizing: (isResizing) => {
					set({ isResizing });
				},

				toggleProjectCollapsed: (projectId) => {
					set((state) => ({
						collapsedProjectIds: state.collapsedProjectIds.includes(projectId)
							? state.collapsedProjectIds.filter((id) => id !== projectId)
							: [...state.collapsedProjectIds, projectId],
					}));
				},

				isProjectCollapsed: (projectId) => {
					return get().collapsedProjectIds.includes(projectId);
				},

				toggleCollapsed: () => {
					const { width, lastExpandedWidth } = get();
					const isCurrentlyCollapsed =
						width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH;

					if (isCurrentlyCollapsed) {
						set({ width: lastExpandedWidth });
					} else {
						set({ width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH });
					}
				},

				isCollapsed: () => {
					return get().width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH;
				},
			}),
			{
				name: WORKSPACE_SIDEBAR_STORAGE_KEY,
				version: 3,
				// v2 could close the sidebar entirely; that comes back as the rail.
				migrate: (persisted, version) => {
					const state = persisted as {
						isOpen?: boolean;
						width?: number;
					} & Record<string, unknown>;
					if (version >= 3) return state;
					const { isOpen, ...rest } = state;
					return isOpen === false
						? { ...rest, width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH }
						: rest;
				},
				// Exclude ephemeral state from persistence
				partialize: (state) => ({
					width: state.width,
					lastExpandedWidth: state.lastExpandedWidth,
					collapsedProjectIds: state.collapsedProjectIds,
					// isResizing intentionally excluded - ephemeral UI state
				}),
			},
		),
		{ name: "WorkspaceSidebarStore" },
	),
);
