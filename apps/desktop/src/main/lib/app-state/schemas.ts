/**
 * UI state schemas (persisted from renderer zustand stores)
 */

export interface Pane {
	id: string;
	tabId: string;
	type: string;
	name: string;
	isNew?: boolean;
	needsAttention?: boolean;
}

export interface UITab {
	id: string;
	name: string;
	userTitle?: string;
	workspaceId: string;
	createdAt: number;
}

export interface TabsState {
	tabs: UITab[];
	panes: Record<string, Pane>;
	activeTabIds: Record<string, string | null>;
	focusedPaneIds: Record<string, string>;
	tabHistoryStacks: Record<string, string[]>;
}

export interface ThemeState {
	theme: "light" | "dark" | "system";
}

export interface AppState {
	tabsState: TabsState;
	themeState: ThemeState;
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
		theme: "system",
	},
};
