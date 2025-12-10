import { ipcMain } from "electron";
import { db } from "./db";
import type { TabsState } from "./db/schemas";
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
		return db.data.tabsState;
	});

	ipcMain.handle(
		"tabs-state:set",
		async (_event, input: { state: TabsState }) => {
			db.data.tabsState = input.state;
			await db.write();
		},
	);
}
