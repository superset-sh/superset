import type { BrowserWindow } from "electron";
import { app, ipcMain } from "electron";
import {
	DESKTOP_TEST_AUTOMATION_CHANNEL,
	type DesktopTestAutomationCommand,
} from "lib/electron-app/test-automation-ipc";
import {
	DESKTOP_E2E_ARTIFACTS_DIR,
	IS_DESKTOP_TEST_MODE,
} from "lib/electron-app/test-mode";
import { SUPERSET_HOME_DIR } from "./app-environment";
import {
	clearDesktopTestAuthToken,
	getDesktopTestAuthState,
	getDesktopTestStoredAuthToken,
	seedDesktopTestAuthToken,
} from "./test-auth";

function assertDesktopTestMode(): void {
	if (!IS_DESKTOP_TEST_MODE) {
		throw new Error(
			"Desktop automation IPC is only available when DESKTOP_TEST_MODE=1.",
		);
	}
}

function getWindowInfo(window: BrowserWindow | null) {
	if (!window) return null;

	return {
		title: window.getTitle(),
		url: window.webContents.getURL(),
		isFocused: window.isFocused(),
		isVisible: window.isVisible(),
		bounds: window.getBounds(),
	};
}

export function registerDesktopTestAutomationIpc(
	getWindow: () => BrowserWindow | null,
): void {
	ipcMain.removeHandler(DESKTOP_TEST_AUTOMATION_CHANNEL);
	ipcMain.handle(
		DESKTOP_TEST_AUTOMATION_CHANNEL,
		async (_event, command: DesktopTestAutomationCommand) => {
			assertDesktopTestMode();

			switch (command.type) {
				case "ping":
					return {
						ok: true,
						testMode: true,
						pid: process.pid,
						appVersion: app.getVersion(),
					};
				case "getEnvironment":
					return {
						testMode: true,
						nodeEnv: process.env.NODE_ENV ?? "development",
						supersetHomeDir: SUPERSET_HOME_DIR,
						artifactsDir: DESKTOP_E2E_ARTIFACTS_DIR,
					};
				case "getWindowInfo":
					return getWindowInfo(getWindow());
				case "getAuthState":
					return getDesktopTestAuthState();
				case "getStoredAuthToken":
					return getDesktopTestStoredAuthToken();
				case "seedAuthToken":
					return seedDesktopTestAuthToken({
						token: command.token,
						expiresAt: command.expiresAt,
					});
				case "clearAuthToken":
					return clearDesktopTestAuthToken();
				default: {
					const exhaustiveCheck: never = command;
					throw new Error(
						`Unsupported desktop automation command: ${exhaustiveCheck}`,
					);
				}
			}
		},
	);
}
