import { ipcMain } from "electron";
import { store } from "./storage-manager";

/**
 * Register storage IPC handlers
 * These handlers provide access to electron-store from the renderer process
 */
export function registerStorageHandlers() {
	ipcMain.handle("storage:get", async (_event, input: { key: string }) => {
		try {
			if (!input || typeof input.key !== "string") {
				console.error("[storage:get] Invalid input:", input);
				return undefined;
			}
			return store.get(input.key);
		} catch (error) {
			console.error("[storage:get] Error getting value:", error);
			return undefined;
		}
	});

	ipcMain.handle(
		"storage:set",
		async (_event, input: { key: string; value: unknown }) => {
			try {
				if (!input || typeof input.key !== "string") {
					console.error("[storage:set] Invalid input:", input);
					return;
				}
				store.set(input.key, input.value);
			} catch (error) {
				console.error("[storage:set] Error setting value:", error);
			}
		},
	);

	ipcMain.handle("storage:delete", async (_event, input: { key: string }) => {
		try {
			if (!input || typeof input.key !== "string") {
				console.error("[storage:delete] Invalid input:", input);
				return;
			}
			store.delete(input.key);
		} catch (error) {
			console.error("[storage:delete] Error deleting value:", error);
		}
	});
}
