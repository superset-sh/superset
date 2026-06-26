/**
 * UI state schemas (persisted from renderer zustand stores)
 */
import type { BaseTabsState } from "shared/tabs-types";
import type { Theme } from "shared/themes";
import type { WorkspaceCardConfig } from "shared/workspace-card-config";

// Re-export for convenience
export type { BaseTabsState as TabsState, Pane } from "shared/tabs-types";

export interface ThemeState {
	activeThemeId: string;
	customThemes: Theme[];
	systemLightThemeId?: string;
	systemDarkThemeId?: string;
}

/** Legacy hotkeys state shape (kept for reading old app-state.json during migration) */
interface LegacyHotkeysState {
	version: number;
	byPlatform: Record<string, Record<string, string | null>>;
}

export interface AppState {
	tabsState: BaseTabsState;
	themeState: ThemeState;
	hotkeysState: LegacyHotkeysState;
	/** Sidebar workspace-card field visibility, keyed by projectId (v1 local or v2 cloud id). */
	workspaceCardConfigs?: Record<string, WorkspaceCardConfig>;
	/**
	 * Consent gate for repo-sourced command lines. Maps projectId to the SHA-256
	 * hash of the command set the user approved. If the repo's commands change,
	 * the hash no longer matches and approval is required again.
	 */
	trustedCardCommandProjects?: Record<string, string>;
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
		systemLightThemeId: "light",
		systemDarkThemeId: "dark",
	},
	hotkeysState: {
		version: 1,
		byPlatform: { darwin: {}, win32: {}, linux: {} },
	},
};
