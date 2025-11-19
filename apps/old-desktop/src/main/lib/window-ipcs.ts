import { BrowserWindow, ipcMain } from "electron";
import windowManager from "./window-manager";

export function registerWindowIPCs() {
	ipcMain.handle("window-create", async () => {
		try {
			await windowManager.createWindow();
			return { success: true };
		} catch (error) {
			console.error("[Window IPC] Failed to create window:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	});

	ipcMain.handle("window-is-restored", async (event) => {
		const senderWindow = BrowserWindow.fromWebContents(event.sender);
		if (!senderWindow) {
			return false;
		}
		return windowManager.isRestoredWindow(senderWindow);
	});
}
