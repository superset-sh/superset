import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface PortsState {
	isListCollapsed: boolean;
	collapsedWorkspaceIds: Record<string, boolean>;

	setListCollapsed: (collapsed: boolean) => void;
	toggleListCollapsed: () => void;
	toggleWorkspaceCollapsed: (workspaceId: string) => void;
}

export const usePortsStore = create<PortsState>()(
	devtools(
		persist(
			(set, get) => ({
				isListCollapsed: false,
				collapsedWorkspaceIds: {},

				setListCollapsed: (collapsed) => set({ isListCollapsed: collapsed }),

				toggleListCollapsed: () =>
					set({ isListCollapsed: !get().isListCollapsed }),

				toggleWorkspaceCollapsed: (workspaceId) =>
					set((state) => ({
						collapsedWorkspaceIds: {
							...state.collapsedWorkspaceIds,
							[workspaceId]: !state.collapsedWorkspaceIds[workspaceId],
						},
					})),
			}),
			{
				name: "ports-store",
				partialize: (state) => ({
					isListCollapsed: state.isListCollapsed,
					collapsedWorkspaceIds: state.collapsedWorkspaceIds,
				}),
			},
		),
		{ name: "PortsStore" },
	),
);
