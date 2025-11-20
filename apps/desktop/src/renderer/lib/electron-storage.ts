import { createJSONStorage } from "zustand/middleware";

/**
 * Custom Zustand storage adapter that uses electron-store for persistence via IPC
 * Stores state in ~/.superset/app-state.json
 */
const electronStorageAdapter = {
	getItem: async (name: string): Promise<string | null> => {
		const value = await window.electronStore.get(name);
		return value as string | null;
	},
	setItem: async (name: string, value: string): Promise<void> => {
		await window.electronStore.set(name, value);
	},
	removeItem: async (name: string): Promise<void> => {
		await window.electronStore.delete(name);
	},
};

export const electronStorage = createJSONStorage(() => electronStorageAdapter);
