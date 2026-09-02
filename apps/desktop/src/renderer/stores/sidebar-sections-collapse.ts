import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type SidebarSectionKey = "cloud" | "pinned" | "sessions" | "workspaces";

export const SIDEBAR_SECTIONS_COLLAPSE_STORAGE_KEY =
	"sidebar-workspaces-collapse";

interface SidebarSectionsCollapseState {
	collapsed: Record<SidebarSectionKey, boolean>;
	toggle: (section: SidebarSectionKey) => void;
}

export const useSidebarSectionsCollapseStore =
	create<SidebarSectionsCollapseState>()(
		devtools(
			persist(
				(set) => ({
					collapsed: {
						cloud: false,
						pinned: false,
						sessions: false,
						workspaces: false,
					},
					toggle: (section) =>
						set((state) => ({
							collapsed: {
								...state.collapsed,
								[section]: !state.collapsed[section],
							},
						})),
				}),
				{
					// Legacy key: v0 held only the workspaces-list flag as
					// { isCollapsed }, before Pinned/Sessions became collapsible.
					name: SIDEBAR_SECTIONS_COLLAPSE_STORAGE_KEY,
					version: 1,
					migrate: (persisted, version) => {
						if (version === 0) {
							const state = persisted as { isCollapsed?: boolean };
							return {
								collapsed: {
									cloud: false,
									pinned: false,
									sessions: false,
									workspaces: state.isCollapsed ?? false,
								},
							};
						}
						// v1 predates the cloud section; an absent key reads as
						// expanded, which is the default we want anyway.
						return persisted as SidebarSectionsCollapseState;
					},
				},
			),
		),
	);
