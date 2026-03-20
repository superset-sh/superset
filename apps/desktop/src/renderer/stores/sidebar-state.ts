import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export enum SidebarMode {
	Tabs = "tabs",
	Changes = "changes",
}

export enum RightSidebarTab {
	Changes = "changes",
	Files = "files",
}

export const DEFAULT_SIDEBAR_WIDTH = 250;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 500;

export type PanelSide = "left" | "right";

interface SidebarState {
	/** Whether the left panel is open */
	isLeftPanelOpen: boolean;
	/** Whether the right panel is open */
	isRightPanelOpen: boolean;
	/** @deprecated Use isRightPanelOpen — kept for backward compat */
	isSidebarOpen: boolean;
	sidebarWidth: number;
	lastOpenSidebarWidth: number;
	currentMode: SidebarMode;
	lastMode: SidebarMode;
	isResizing: boolean;
	rightSidebarTab: RightSidebarTab;
	/** Which side each tab is docked on */
	tabPositions: Record<RightSidebarTab, PanelSide>;
	/** Width of the left panel (when tabs are docked left) */
	leftPanelWidth: number;
	toggleLeftPanel: () => void;
	toggleRightPanel: () => void;
	/** @deprecated Use toggleRightPanel — toggles the right panel for hotkey compat */
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
	setSidebarWidth: (width: number) => void;
	setMode: (mode: SidebarMode) => void;
	setIsResizing: (isResizing: boolean) => void;
	setRightSidebarTab: (tab: RightSidebarTab) => void;
	setTabPosition: (tab: RightSidebarTab, side: PanelSide) => void;
	setLeftPanelWidth: (width: number) => void;
}

export const useSidebarStore = create<SidebarState>()(
	devtools(
		persist(
			(set, get) => ({
				isLeftPanelOpen: false,
				isRightPanelOpen: true,
				isSidebarOpen: true,
				sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
				lastOpenSidebarWidth: DEFAULT_SIDEBAR_WIDTH,
				currentMode: SidebarMode.Tabs,
				lastMode: SidebarMode.Tabs,
				isResizing: false,
				rightSidebarTab: RightSidebarTab.Changes,
				tabPositions: {
					[RightSidebarTab.Changes]: "right",
					[RightSidebarTab.Files]: "right",
				},
				leftPanelWidth: DEFAULT_SIDEBAR_WIDTH,

				toggleLeftPanel: () => {
					set((s) => ({ isLeftPanelOpen: !s.isLeftPanelOpen }));
				},

				toggleRightPanel: () => {
					const {
						isRightPanelOpen,
						lastOpenSidebarWidth,
						currentMode,
						lastMode,
					} = get();
					if (isRightPanelOpen) {
						set({
							isRightPanelOpen: false,
							isSidebarOpen: false,
							sidebarWidth: 0,
							lastMode: currentMode,
							currentMode: SidebarMode.Tabs,
						});
					} else {
						set({
							isRightPanelOpen: true,
							isSidebarOpen: true,
							sidebarWidth: lastOpenSidebarWidth,
							currentMode: lastMode,
						});
					}
				},

				toggleSidebar: () => {
					// Backward compat — toggles right panel
					get().toggleRightPanel();
				},

				setSidebarOpen: (open) => {
					const { lastOpenSidebarWidth, currentMode, lastMode } = get();
					if (open) {
						set({
							isRightPanelOpen: true,
							isSidebarOpen: true,
							sidebarWidth: lastOpenSidebarWidth,
							currentMode: lastMode,
						});
					} else {
						set({
							isRightPanelOpen: false,
							isSidebarOpen: false,
							sidebarWidth: 0,
							lastMode: currentMode,
							currentMode: SidebarMode.Tabs,
						});
					}
				},

				setSidebarWidth: (width) => {
					const clampedWidth = Math.max(
						MIN_SIDEBAR_WIDTH,
						Math.min(MAX_SIDEBAR_WIDTH, width),
					);

					if (width > 0) {
						const { sidebarWidth, lastOpenSidebarWidth, isRightPanelOpen } =
							get();
						if (
							sidebarWidth === clampedWidth &&
							lastOpenSidebarWidth === clampedWidth &&
							isRightPanelOpen
						) {
							return;
						}
						set({
							sidebarWidth: clampedWidth,
							lastOpenSidebarWidth: clampedWidth,
							isRightPanelOpen: true,
							isSidebarOpen: true,
						});
					} else {
						const { currentMode } = get();
						set({
							sidebarWidth: 0,
							isRightPanelOpen: false,
							isSidebarOpen: false,
							lastMode: currentMode,
							currentMode: SidebarMode.Tabs,
						});
					}
				},

				setMode: (mode) => {
					set({ currentMode: mode });
				},

				setIsResizing: (isResizing) => {
					set({ isResizing });
				},

				setRightSidebarTab: (tab) => {
					set({ rightSidebarTab: tab });
				},

				setTabPosition: (tab, side) => {
					const { tabPositions } = get();
					set({
						tabPositions: { ...tabPositions, [tab]: side },
					});
				},

				setLeftPanelWidth: (width) => {
					const clamped = Math.max(
						MIN_SIDEBAR_WIDTH,
						Math.min(MAX_SIDEBAR_WIDTH, width),
					);
					set({ leftPanelWidth: clamped });
				},
			}),
			{
				name: "sidebar-store",
				migrate: (persistedState: unknown, version: number) => {
					const state = persistedState as Partial<SidebarState>;
					// v0→v1: Convert old percentage-based values (<100) to pixel widths
					if (state.sidebarWidth !== undefined && state.sidebarWidth < 100) {
						state.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
						state.lastOpenSidebarWidth = DEFAULT_SIDEBAR_WIDTH;
					}
					// v1→v2: Initialize independent panel open states from legacy isSidebarOpen
					if (version < 2) {
						const wasOpen = state.isSidebarOpen ?? true;
						state.isRightPanelOpen = wasOpen;
						state.isLeftPanelOpen = false;
					}
					return state as SidebarState;
				},
				version: 2,
			},
		),
		{ name: "SidebarStore" },
	),
);
