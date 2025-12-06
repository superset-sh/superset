import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export enum SidebarMode {
	Tabs = "tabs",
	Changes = "changes",
}

const DEFAULT_SIDEBAR_SIZE = 15;

interface SidebarState {
	isSidebarOpen: boolean;
	sidebarSize: number;
	currentMode: SidebarMode;
	isResizing: boolean;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
	setSidebarSize: (size: number) => void;
	setMode: (mode: SidebarMode) => void;
	setIsResizing: (isResizing: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
	devtools(
		persist(
			(set, get) => ({
				isSidebarOpen: true,
				sidebarSize: DEFAULT_SIDEBAR_SIZE,
				currentMode: SidebarMode.Tabs,
				isResizing: false,

				toggleSidebar: () => {
					const { isSidebarOpen, sidebarSize } = get();
					if (isSidebarOpen) {
						set({ isSidebarOpen: false });
					} else {
						set({
							isSidebarOpen: true,
							sidebarSize:
								sidebarSize === 0 ? DEFAULT_SIDEBAR_SIZE : sidebarSize,
						});
					}
				},

				setSidebarOpen: (open) => {
					const { sidebarSize } = get();
					set({
						isSidebarOpen: open,
						sidebarSize:
							open && sidebarSize === 0 ? DEFAULT_SIDEBAR_SIZE : sidebarSize,
					});
				},

				setSidebarSize: (size) => {
					set({
						sidebarSize: size,
						isSidebarOpen: size > 0,
					});
				},

				setMode: (mode) => {
					set({ currentMode: mode });
				},

				setIsResizing: (isResizing) => {
					set({ isResizing });
				},
			}),
			{ name: "sidebar-store" },
		),
		{ name: "SidebarStore" },
	),
);
