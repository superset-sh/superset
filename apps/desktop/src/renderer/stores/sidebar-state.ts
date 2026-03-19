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
	/** Which side the project focus bar is docked on (focus windows only) */
	projectFocusPosition: PanelSide;
	/** Height of the project focus section in the sidebar (0 = auto/content height) */
	projectFocusHeight: number;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
	setSidebarWidth: (width: number) => void;
	setMode: (mode: SidebarMode) => void;
	setIsResizing: (isResizing: boolean) => void;
	setRightSidebarTab: (tab: RightSidebarTab) => void;
	setTabPosition: (tab: RightSidebarTab, side: PanelSide) => void;
	setLeftPanelWidth: (width: number) => void;
	setProjectFocusPosition: (side: PanelSide) => void;
	setProjectFocusHeight: (height: number) => void;
}

export const useSidebarStore = create<SidebarState>()(
	devtools(
		persist(
			(set, get) => ({
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
				projectFocusPosition: "right" as PanelSide,
				projectFocusHeight: 0,

				toggleSidebar: () => {
					const { isSidebarOpen, lastOpenSidebarWidth, currentMode, lastMode } =
						get();
					if (isSidebarOpen) {
						set({
							isSidebarOpen: false,
							sidebarWidth: 0,
							lastMode: currentMode,
							currentMode: SidebarMode.Tabs,
						});
					} else {
						set({
							isSidebarOpen: true,
							sidebarWidth: lastOpenSidebarWidth,
							currentMode: lastMode,
						});
					}
				},

				setSidebarOpen: (open) => {
					const { lastOpenSidebarWidth, currentMode, lastMode } = get();
					if (open) {
						set({
							isSidebarOpen: true,
							sidebarWidth: lastOpenSidebarWidth,
							currentMode: lastMode,
						});
					} else {
						set({
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
						const { sidebarWidth, lastOpenSidebarWidth, isSidebarOpen } = get();
						if (
							sidebarWidth === clampedWidth &&
							lastOpenSidebarWidth === clampedWidth &&
							isSidebarOpen
						) {
							return;
						}
						set({
							sidebarWidth: clampedWidth,
							lastOpenSidebarWidth: clampedWidth,
							isSidebarOpen: true,
						});
					} else {
						const { currentMode } = get();
						set({
							sidebarWidth: 0,
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

				setProjectFocusPosition: (side) => {
					set({ projectFocusPosition: side });
				},

				setProjectFocusHeight: (height) => {
					set({ projectFocusHeight: Math.max(0, height) });
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
