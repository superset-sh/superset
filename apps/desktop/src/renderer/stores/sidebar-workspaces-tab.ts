import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface SidebarWorkspacesTabState {
	isVisible: boolean;
	setVisible: (isVisible: boolean) => void;
}

export const useSidebarWorkspacesTabStore = create<SidebarWorkspacesTabState>()(
	devtools(
		persist(
			(set) => ({
				isVisible: false,
				setVisible: (isVisible) => {
					set({ isVisible });
				},
			}),
			{ name: "sidebar-workspaces-tab" },
		),
		{ name: "SidebarWorkspacesTabStore" },
	),
);

export const useIsWorkspacesTabVisible = () =>
	useSidebarWorkspacesTabStore((state) => state.isVisible);
export const useSetWorkspacesTabVisible = () =>
	useSidebarWorkspacesTabStore((state) => state.setVisible);
