import { JSONFilePreset } from "lowdb/node";
import { APP_STATE_PATH } from "../app-environment";
import type { AppState } from "./schemas";
import { defaultAppState } from "./schemas";

type AppStateDB = Awaited<ReturnType<typeof JSONFilePreset<AppState>>>;

let _appState: AppStateDB | null = null;

/**
 * Ensures loaded data has the correct shape by merging with defaults.
 * Handles legacy app-state.json files that may have a different structure
 * (e.g., from old electron-store format with keys like "tabs-storage").
 */
function ensureValidShape(data: Partial<AppState>): AppState {
	const tabsState = {
		...defaultAppState.tabsState,
		...(data.tabsState ?? {}),
	};
	// Agent-session captures are keyed by pane id; drop entries whose pane is
	// gone so the record can't grow past the pane set. Optional-chain: legacy
	// app-state.json variants can carry a null panes map.
	const v1AgentSessions = Object.fromEntries(
		Object.entries(data.v1AgentSessions ?? {}).filter(
			([paneId]) => tabsState.panes?.[paneId] !== undefined,
		),
	);
	return {
		tabsState,
		v1AgentSessions,
		themeState: {
			...defaultAppState.themeState,
			...(data.themeState ?? {}),
		},
		hotkeysState: {
			...defaultAppState.hotkeysState,
			...(data.hotkeysState ?? {}),
			byPlatform: {
				...defaultAppState.hotkeysState.byPlatform,
				...(data.hotkeysState?.byPlatform ?? {}),
			},
		},
		lastRunVersion: data.lastRunVersion,
	};
}

export async function initAppState(): Promise<void> {
	if (_appState) return;

	_appState = await JSONFilePreset<AppState>(APP_STATE_PATH, defaultAppState);

	// Reshape data to ensure it has the correct structure (handles legacy formats)
	_appState.data = ensureValidShape(_appState.data);

	console.log(`App state initialized at: ${APP_STATE_PATH}`);
}

export const appState = new Proxy({} as AppStateDB, {
	get(_target, prop) {
		if (!_appState) {
			throw new Error("App state not initialized. Call initAppState() first.");
		}
		const value = _appState[prop as keyof AppStateDB];
		// Bind methods to the real instance to preserve correct `this` context
		if (typeof value === "function") {
			return value.bind(_appState);
		}
		return value;
	},
});
