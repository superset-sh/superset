import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { nativeTheme } from "electron";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { attachWindowToIpcHandler } from "main/lib/ipc-handler";
import { cleanupPanePresenceForWebContents } from "main/lib/pane-presence";

const paneWindows = new Map<string, BrowserWindow>();

interface OpenPaneWindowInput {
	paneId: string;
	paneName?: string;
	workspaceName?: string;
}

interface OpenPaneWindowResult {
	reused: boolean;
}

export function hasLivePaneWindow(paneId: string): boolean {
	const window = paneWindows.get(paneId);
	if (!window) return false;
	if (window.isDestroyed()) {
		paneWindows.delete(paneId);
		return false;
	}
	return true;
}

export function hasOtherLivePaneWindow(
	paneId: string,
	windowToExclude?: BrowserWindow | null,
): boolean {
	const window = paneWindows.get(paneId);
	if (!window) return false;
	if (window.isDestroyed()) {
		paneWindows.delete(paneId);
		return false;
	}
	if (windowToExclude && window.id === windowToExclude.id) {
		return false;
	}
	return true;
}

export function openPaneWindow({
	paneId,
	paneName,
	workspaceName,
}: OpenPaneWindowInput): OpenPaneWindowResult {
	const trimmedPaneName = paneName?.trim();
	const trimmedWorkspaceName = workspaceName?.trim();
	const windowTitle =
		trimmedPaneName && trimmedWorkspaceName
			? `${trimmedPaneName} - ${trimmedWorkspaceName}`
			: trimmedPaneName || trimmedWorkspaceName || "Pane";

	const existingWindow = paneWindows.get(paneId);
	if (existingWindow && hasLivePaneWindow(paneId)) {
		existingWindow.setTitle(windowTitle);
		if (existingWindow.isMinimized()) {
			existingWindow.restore();
		}
		existingWindow.show();
		existingWindow.focus();
		return { reused: true };
	}

	const window = createWindow({
		id: "pane",
		title: windowTitle,
		width: 1200,
		height: 760,
		minWidth: 520,
		minHeight: 360,
		show: false,
		autoHideMenuBar: true,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#252525" : "#ffffff",
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			webviewTag: true,
			partition: "persist:superset",
		},
		hash: `/pane/${encodeURIComponent(paneId)}`,
	});
	attachWindowToIpcHandler(window);
	const webContentsId = window.webContents.id;

	paneWindows.set(paneId, window);

	window.webContents.on("did-finish-load", () => {
		if (!window.isDestroyed()) {
			window.show();
		}
	});
	window.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			console.error("[pane-window] Failed to load renderer:");
			console.error(`  Error code: ${errorCode}`);
			console.error(`  Description: ${errorDescription}`);
			console.error(`  URL: ${validatedURL}`);
			if (!window.isDestroyed()) {
				window.show();
			}
		},
	);
	window.webContents.on("destroyed", () => {
		cleanupPanePresenceForWebContents(webContentsId);
	});

	window.on("closed", () => {
		paneWindows.delete(paneId);
	});

	return { reused: false };
}
