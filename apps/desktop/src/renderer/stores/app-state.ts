import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface AppState {
	isSidebarOpen: boolean;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
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
		{ name: "AppStore" },
	),
);

