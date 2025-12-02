import { createJSONStorage } from "zustand/middleware";

/**
 * Custom Zustand storage adapter that uses electron-store for persistence via IPC
 * Stores state in ~/.superset/app-state.json
 */
const electronStorageAdapter = {
	getItem: async (name: string): Promise<string | null> => {
		try {
			const value = await window.electronStore.get(name);

			// Validate that the value is either null, undefined, or a string
			if (value === null || value === undefined) {
				return null;
			}

			if (typeof value === "string") {
				return value;
			}

			// If we got a non-string value, it's corrupted data
			console.error("[electronStorage] Corrupted data for key:", name, "Expected string, got:", typeof value);
			return null;
		} catch (error) {
			console.error("[electronStorage] Failed to get item:", name, error);
			return null;
		}
	},
	setItem: async (name: string, value: string): Promise<void> => {
		try {
			await window.electronStore.set(name, value);
		} catch (error) {
			console.error("[electronStorage] Failed to set item:", name, error);
			// Don't throw - let Zustand handle the failure gracefully
		}
	},
	removeItem: async (name: string): Promise<void> => {
		try {
			await window.electronStore.delete(name);
		} catch (error) {
			console.error("[electronStorage] Failed to remove item:", name, error);
			// Don't throw - let Zustand handle the failure gracefully
		}
	},
};

export const electronStorage = createJSONStorage(() => electronStorageAdapter);
