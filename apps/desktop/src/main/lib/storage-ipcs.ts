import { ipcMain } from "electron";
import { appState } from "./app-state";
import type { TabsState } from "./app-state/schemas";
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
		async (_event, input: { key: string; value: unknown }) => {
			store.set(input.key, input.value);
		},
	);

	ipcMain.handle("storage:delete", async (_event, input: { key: string }) => {
		store.delete(input.key);
	});

	// Lowdb-backed tabs state storage
	ipcMain.handle("tabs-state:get", async () => {
		return appState.data.tabsState;
	});

	ipcMain.handle(
		"tabs-state:set",
		async (_event, input: { state: TabsState }) => {
			appState.data.tabsState = input.state;
			await appState.write();
		},
	);
}
