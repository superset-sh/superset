import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

const DEFAULT_WORKSPACE_SIDEBAR_WIDTH = 280;
export const MIN_WORKSPACE_SIDEBAR_WIDTH = 220;
export const MAX_WORKSPACE_SIDEBAR_WIDTH = 400;

interface WorkspaceSidebarState {
	isOpen: boolean;
	width: number;
	lastOpenWidth: number;
	// Use string[] instead of Set<string> for JSON serialization with Zustand persist
	collapsedProjectIds: string[];
	isResizing: boolean;

	toggleOpen: () => void;
	setOpen: (open: boolean) => void;
	setWidth: (width: number) => void;
	setIsResizing: (isResizing: boolean) => void;
	toggleProjectCollapsed: (projectId: string) => void;
	isProjectCollapsed: (projectId: string) => boolean;
}

export const useWorkspaceSidebarStore = create<WorkspaceSidebarState>()(
	devtools(
		persist(
			(set, get) => ({
				isOpen: true,
				width: DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
				lastOpenWidth: DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
				collapsedProjectIds: [],
				isResizing: false,

				toggleOpen: () => {
					const { isOpen, lastOpenWidth } = get();
					if (isOpen) {
						set({ isOpen: false, width: 0 });
					} else {
						set({
							isOpen: true,
							width: lastOpenWidth,
						});
					}
				},

				setOpen: (open) => {
					const { lastOpenWidth } = get();
					set({
						isOpen: open,
						width: open ? lastOpenWidth : 0,
					});
				},

				setWidth: (width) => {
					const clampedWidth = Math.max(
						MIN_WORKSPACE_SIDEBAR_WIDTH,
						Math.min(MAX_WORKSPACE_SIDEBAR_WIDTH, width),
					);

					if (width > 0) {
						set({
							width: clampedWidth,
							lastOpenWidth: clampedWidth,
							isOpen: true,
						});
					} else {
						set({
							width: 0,
							isOpen: false,
						});
					}
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
			}),
			{
				name: "workspace-sidebar-store",
				version: 1,
			},
		),
		{ name: "WorkspaceSidebarStore" },
	),
);
