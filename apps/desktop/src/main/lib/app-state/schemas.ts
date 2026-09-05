/**
 * UI state schemas (persisted from renderer zustand stores)
 */
import type { BaseTabsState } from "shared/tabs-types";
import type { Theme } from "shared/themes";

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

/**
 * Last known CLI agent session in a v1 terminal pane, captured from the hook
 * server so the v1→v2 migration can seed a resume candidate for the pane's
 * recreated terminal. Mirrors host-service terminal_agent_bindings semantics:
 * `prompted` ↔ progressed past session start (never-prompted sessions have no
 * persisted conversation), `endedAt` ↔ the agent's own SessionEnd goodbye
 * (a clean quit, not resumable).
 */
export interface V1PaneAgentSession {
	agentId: string;
	agentSessionId: string;
	prompted: boolean;
	endedAt?: number;
	updatedAt: number;
}

export interface AppState {
	/**
	 * The pre-multi-window layout. Retained as the record the first restored
	 * window inherits (see LEGACY_WINDOW_KEY); new windows never write here.
	 */
	tabsState: BaseTabsState;
	/**
	 * Tab layout per window, keyed by the window's persisted key. Every window
	 * is its own renderer writing its whole layout, so a single shared record
	 * meant the last window to write won and every window restored the same
	 * (wrong) layout. Pruned to the restorable window set on every persist.
	 */
	tabsStateByWindow?: Record<string, BaseTabsState>;
	themeState: ThemeState;
	hotkeysState: LegacyHotkeysState;
	/** v1 pane id → last agent session seen there (see V1PaneAgentSession). */
	v1AgentSessions?: Record<string, V1PaneAgentSession>;
	/** App version at last launch; a mismatch means an update was just installed */
	lastRunVersion?: string;
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
