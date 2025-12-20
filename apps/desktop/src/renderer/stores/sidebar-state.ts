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
	lastOpenSidebarSize: number;
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
				lastOpenSidebarSize: DEFAULT_SIDEBAR_SIZE,
				currentMode: SidebarMode.Tabs,
				isResizing: false,

				toggleSidebar: () => {
					const { isSidebarOpen, lastOpenSidebarSize } = get();
					if (isSidebarOpen) {
						set({ isSidebarOpen: false, sidebarSize: 0 });
					} else {
						set({
							isSidebarOpen: true,
							sidebarSize: lastOpenSidebarSize,
						});
					}
				},

				setSidebarOpen: (open) => {
					const { lastOpenSidebarSize } = get();
					set({
						isSidebarOpen: open,
						sidebarSize: open ? lastOpenSidebarSize : 0,
					});
				},

				setSidebarSize: (size) => {
					// When collapsing, don't update lastOpenSidebarSize
					// When resizing to a new size, update both
					if (size > 0) {
						set({
							sidebarSize: size,
							lastOpenSidebarSize: size,
							isSidebarOpen: true,
						});
					} else {
						set({
							sidebarSize: 0,
							isSidebarOpen: false,
						});
					}
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
