import { create } from "zustand";
import { devtools } from "zustand/middleware";

export enum SidebarMode {
	Tabs = "tabs",
	Changes = "changes",
}

interface SidebarState {
	isSidebarOpen: boolean;
	currentMode: SidebarMode;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
	setMode: (mode: SidebarMode) => void;
}

export const useSidebarStore = create<SidebarState>()(
	devtools(
		(set) => ({
			isSidebarOpen: true,
			currentMode: "tabs",

			toggleSidebar: () => {
				set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
			},

			setSidebarOpen: (open) => {
				set({ isSidebarOpen: open });
			},

			setMode: (mode) => {
				set({ currentMode: mode });
			},
		}),
		{ name: "SidebarStore" },
	),
);
