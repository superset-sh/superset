import { ipcMain } from "electron";
import { store } from "./storage-manager";

/**
 * Register storage IPC handlers
 * These handlers provide access to electron-store from the renderer process
 */
export function registerStorageHandlers() {
	ipcMain.handle("storage:get", async (_event, input: { key: string }) => {
		return store.get(input.key);
	});

	ipcMain.handle(
		"storage:set",
		async (_event, input: { key: string; value: any }) => {
			store.set(input.key, input.value);
		},
	);

	ipcMain.handle("storage:delete", async (_event, input: { key: string }) => {
		store.delete(input.key);
	});
}
