import { readFileSync } from "node:fs";
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
	const tabsStateByWindow = Object.fromEntries(
		Object.entries(data.tabsStateByWindow ?? {}).map(([key, state]) => [
			key,
			{ ...defaultAppState.tabsState, ...(state ?? {}) },
		]),
	);
	return {
		tabsState,
		tabsStateByWindow,
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

/**
 * Re-read only themeState from disk into the in-memory app state. Used when
 * an external writer (the CLI) updates app-state.json while the app runs:
 * without this, the next lowdb flush would clobber the external change.
 * Deliberately does not reload other fields — they are owned by in-memory
 * state and may have unflushed updates.
 */
export function reloadThemeStateFromDisk(): AppState["themeState"] | null {
	if (!_appState) return null;
	try {
		const raw = readFileSync(APP_STATE_PATH, "utf-8");
		const parsed = JSON.parse(raw) as Partial<AppState> | null;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return null;
		}
		const themeState = {
			...defaultAppState.themeState,
			...(parsed.themeState ?? {}),
		};
		_appState.data.themeState = themeState;
		return themeState;
	} catch (error) {
		console.error("[app-state] Failed to reload themeState from disk:", error);
		return null;
	}
}

export async function initAppState(): Promise<void> {
	if (_appState) return;

	_appState = await JSONFilePreset<AppState>(APP_STATE_PATH, defaultAppState);

	// Reshape data to ensure it has the correct structure (handles legacy formats)
	_appState.data = ensureValidShape(_appState.data);

	console.log(`App state initialized at: ${APP_STATE_PATH}`);
}

export function isAppStateInitialized(): boolean {
	return _appState !== null;
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

/**
 * Drop per-window state for windows that will not be restored.
 *
 * Called from the same place that writes the restorable window set, so the two
 * cannot drift: a window whose key is no longer persisted is gone for good, and
 * keeping its layout would grow app-state.json on every new window forever.
 */
export function pruneWindowScopedState(liveKeys: string[]): void {
	const byWindow = appState.data.tabsStateByWindow;
	if (!byWindow) return;
	const live = new Set(liveKeys);
	const kept = Object.fromEntries(
		Object.entries(byWindow).filter(([key]) => live.has(key)),
	);
	if (Object.keys(kept).length === Object.keys(byWindow).length) return;
	appState.data.tabsStateByWindow = kept;
}
