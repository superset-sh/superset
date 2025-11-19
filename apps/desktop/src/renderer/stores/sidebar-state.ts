import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface SidebarState {
	isSidebarOpen: boolean;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
	devtools(
		(set) => ({
			isSidebarOpen: true,

			toggleSidebar: () => {
				set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
			},

			setSidebarOpen: (open) => {
				set({ isSidebarOpen: open });
			},
		}),
		{ name: "SidebarStore" },
	),
);
