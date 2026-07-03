import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface WorkspaceDetailsState {
	// Sections are expanded by default; we only persist the ones the user has
	// explicitly collapsed so the map stays small and new sections show their
	// details automatically. Keys are `${workspaceId}:${sectionKey}`.
	collapsedSectionKeys: Record<string, true>;

	setExpanded: (sectionKey: string, expanded: boolean) => void;
	toggleExpanded: (sectionKey: string) => void;
}

export const useWorkspaceDetailsStore = create<WorkspaceDetailsState>()(
	devtools(
		persist(
			(set, get) => ({
				collapsedSectionKeys: {},

				setExpanded: (sectionKey, expanded) =>
					set((state) => {
						const next = { ...state.collapsedSectionKeys };
						if (expanded) {
							delete next[sectionKey];
						} else {
							next[sectionKey] = true;
						}
						return { collapsedSectionKeys: next };
					}),

				toggleExpanded: (sectionKey) => {
					const isCollapsed = !!get().collapsedSectionKeys[sectionKey];
					get().setExpanded(sectionKey, isCollapsed);
				},
			}),
			{
				name: "workspace-details-store",
				partialize: (state) => ({
					collapsedSectionKeys: state.collapsedSectionKeys,
				}),
			},
		),
		{ name: "WorkspaceDetailsStore" },
	),
);
