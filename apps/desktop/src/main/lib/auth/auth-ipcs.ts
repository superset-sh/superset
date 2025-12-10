import { ipcMain } from "electron";
import { authManager } from "./auth-manager";

/**
 * Register IPC handlers for authentication
 */
export function registerAuthHandlers(): void {
	ipcMain.handle("auth:get-session", () => {
		return authManager.getSession();
	});

	ipcMain.handle("auth:start-sign-in", async () => {
		return authManager.startSignIn();
	});

	ipcMain.handle("auth:start-sign-up", async () => {
		return authManager.startSignUp();
	});

	ipcMain.handle("auth:sign-out", async () => {
		return authManager.signOut();
	});

	ipcMain.handle("auth:refresh-session", async () => {
		return authManager.refreshSession();
	});
}
