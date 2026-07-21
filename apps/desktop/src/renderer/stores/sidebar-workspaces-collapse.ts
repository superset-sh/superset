import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface SidebarWorkspacesCollapseState {
	isCollapsed: boolean;
	toggle: () => void;
}

export const useSidebarWorkspacesCollapseStore =
	create<SidebarWorkspacesCollapseState>()(
		devtools(
			persist(
				(set) => ({
					isCollapsed: false,
					toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
				}),
				{ name: "sidebar-workspaces-collapse" },
			),
		),
	);
