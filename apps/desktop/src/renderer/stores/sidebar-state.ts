import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export enum SidebarMode {
	Tabs = "tabs",
	Changes = "changes",
}

const DEFAULT_SIDEBAR_WIDTH = 250;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 500;

interface SidebarState {
	isSidebarOpen: boolean;
	sidebarWidth: number;
	lastOpenSidebarWidth: number;
	currentMode: SidebarMode;
	isResizing: boolean;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
	setSidebarWidth: (width: number) => void;
	setMode: (mode: SidebarMode) => void;
	setIsResizing: (isResizing: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
	devtools(
		persist(
			(set, get) => ({
				isSidebarOpen: true,
				sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
				lastOpenSidebarWidth: DEFAULT_SIDEBAR_WIDTH,
				currentMode: SidebarMode.Tabs,
				isResizing: false,

				toggleSidebar: () => {
					const { isSidebarOpen, lastOpenSidebarWidth } = get();
					if (isSidebarOpen) {
						set({ isSidebarOpen: false, sidebarWidth: 0 });
					} else {
						set({
							isSidebarOpen: true,
							sidebarWidth: lastOpenSidebarWidth,
						});
					}
				},

				setSidebarOpen: (open) => {
					const { lastOpenSidebarWidth } = get();
					set({
						isSidebarOpen: open,
						sidebarWidth: open ? lastOpenSidebarWidth : 0,
					});
				},

				setSidebarWidth: (width) => {
					const clampedWidth = Math.max(
						MIN_SIDEBAR_WIDTH,
						Math.min(MAX_SIDEBAR_WIDTH, width),
					);

					if (width > 0) {
						set({
							sidebarWidth: clampedWidth,
							lastOpenSidebarWidth: clampedWidth,
							isSidebarOpen: true,
						});
					} else {
						set({
							sidebarWidth: 0,
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
			{
				name: "sidebar-store",
				migrate: (persistedState: unknown, _version: number) => {
					const state = persistedState as Partial<SidebarState>;
					// Convert old percentage-based values (<100) to pixel widths
					if (state.sidebarWidth !== undefined && state.sidebarWidth < 100) {
						state.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
						state.lastOpenSidebarWidth = DEFAULT_SIDEBAR_WIDTH;
					}
					return state as SidebarState;
				},
				version: 1,
			},
		),
		{ name: "SidebarStore" },
	),
);
