/**
 * UI state schemas (persisted from renderer zustand stores)
 */
import { createDefaultHotkeysState, type HotkeysState } from "shared/hotkeys";
import type { BaseTabsState } from "shared/tabs-types";
import type { Theme } from "shared/themes";

// Re-export for convenience
export type { BaseTabsState as TabsState, Pane } from "shared/tabs-types";

export interface ThemeState {
	activeThemeId: string;
	customThemes: Theme[];
}

export interface AppState {
	tabsState: BaseTabsState;
	themeState: ThemeState;
	hotkeysState: HotkeysState;
	/** Project IDs that had focus windows open at last quit (for restore on launch) */
	openFocusWindowProjectIds: string[];
}

export const defaultAppState: AppState = {
	tabsState: {
		tabs: [],
		panes: {},
		activeTabIds: {},
		focusedPaneIds: {},
		tabHistoryStacks: {},
	},
	themeState: {
		activeThemeId: "dark",
		customThemes: [],
	},
	hotkeysState: createDefaultHotkeysState(),
	openFocusWindowProjectIds: [],
};
