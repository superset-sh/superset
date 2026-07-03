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
				version: 1,
				// v0 persisted one `collapsedWorkspaceIds[workspaceId]` flag for the
				// whole details area; expand it to every per-section key.
				migrate: (persisted, version) => {
					if (version === 0) {
						const old = persisted as {
							collapsedWorkspaceIds?: Record<string, true>;
						};
						const collapsedSectionKeys: Record<string, true> = {};
						for (const workspaceId of Object.keys(
							old.collapsedWorkspaceIds ?? {},
						)) {
							collapsedSectionKeys[`${workspaceId}:ports`] = true;
							collapsedSectionKeys[`${workspaceId}:agents`] = true;
						}
						return { collapsedSectionKeys };
					}
					return persisted as { collapsedSectionKeys: Record<string, true> };
				},
				partialize: (state) => ({
					collapsedSectionKeys: state.collapsedSectionKeys,
				}),
			},
		),
		{ name: "WorkspaceDetailsStore" },
	),
);
