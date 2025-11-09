import { ipcMain } from "electron";
import { deepLinkManager } from "./deep-link-manager";

/**
 * Register IPC handlers for deep linking
 */
export function registerDeepLinkIpcs(): void {
	// Get the current deep link URL
	ipcMain.handle("deep-link-get-url", async () => {
		return deepLinkManager.getAndClearUrl();
	});

	console.log("[DeepLinkIpcs] Registered deep link IPC handlers");
}
