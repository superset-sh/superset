import { createJSONStorage } from "zustand/middleware";

/**
 * Zustand storage adapter that uses lowdb for persistence via IPC.
 * Unlike electron-store, lowdb stores objects directly (no JSON serialization needed).
 */
const lowdbStorageAdapter = {
	getItem: async (_name: string): Promise<string | null> => {
		const state = await window.tabsState.get();
		if (!state) return null;
		// Wrap in zustand persist format
		return JSON.stringify({ state, version: 0 });
	},
	setItem: async (name: string, value: string): Promise<void> => {
		try {
			const parsed = JSON.parse(value) as { state: unknown; version: number };
			await window.tabsState.set(parsed.state);
		} catch (error) {
			console.error(`[lowdb-storage] Failed to parse state for "${name}":`, error);
			// Skip the corrupted value - don't update storage
		}
	},
	removeItem: async (_name: string): Promise<void> => {
		// Reset to empty state
		await window.tabsState.set({
			tabs: [],
			panes: {},
			activeTabIds: {},
			focusedPaneIds: {},
		});
	},
};

export const lowdbTabsStorage = createJSONStorage(() => lowdbStorageAdapter);
