import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface WorkspaceDetailsState {
	// Workspaces are expanded by default; we only persist the ones the user has
	// explicitly collapsed so the map stays small and new workspaces show their
	// details automatically.
	collapsedWorkspaceIds: Record<string, true>;

	setExpanded: (workspaceId: string, expanded: boolean) => void;
	toggleExpanded: (workspaceId: string) => void;
}

export const useWorkspaceDetailsStore = create<WorkspaceDetailsState>()(
	devtools(
		persist(
			(set, get) => ({
				collapsedWorkspaceIds: {},

				setExpanded: (workspaceId, expanded) =>
					set((state) => {
						const next = { ...state.collapsedWorkspaceIds };
						if (expanded) {
							delete next[workspaceId];
						} else {
							next[workspaceId] = true;
						}
						return { collapsedWorkspaceIds: next };
					}),

				toggleExpanded: (workspaceId) => {
					const isCollapsed = !!get().collapsedWorkspaceIds[workspaceId];
					get().setExpanded(workspaceId, isCollapsed);
				},
			}),
			{
				name: "workspace-details-store",
				partialize: (state) => ({
					collapsedWorkspaceIds: state.collapsedWorkspaceIds,
				}),
			},
		),
		{ name: "WorkspaceDetailsStore" },
	),
);
