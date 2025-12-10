import { app, type BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { ENVIRONMENT, PLATFORM } from "shared/constants";

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4; // 4 hours
const UPDATE_FEED_URL =
	"https://github.com/superset-sh/superset/releases/latest/download";

let mainWindow: BrowserWindow | null = null;
let isUpdateDialogOpen = false;

export function setMainWindow(window: BrowserWindow): void {
	mainWindow = window;
}

export function checkForUpdates(): void {
	if (ENVIRONMENT.IS_DEV || !PLATFORM.IS_MAC) {
		return;
	}
	autoUpdater.checkForUpdates().catch((error) => {
		console.error("[auto-updater] Failed to check for updates:", error);
	});
}

export function checkForUpdatesInteractive(): void {
	if (ENVIRONMENT.IS_DEV) {
		dialog.showMessageBox({
			type: "info",
			title: "Updates",
			message: "Auto-updates are disabled in development mode.",
		});
		return;
	}
	if (!PLATFORM.IS_MAC) {
		dialog.showMessageBox({
			type: "info",
			title: "Updates",
			message: "Auto-updates are only available on macOS.",
		});
		return;
	}

	autoUpdater
		.checkForUpdates()
		.then((result) => {
			if (!result || !result.updateInfo) {
				dialog.showMessageBox({
					type: "info",
					title: "No Updates",
					message: "You are running the latest version.",
				});
			}
		})
		.catch((error) => {
			console.error("[auto-updater] Failed to check for updates:", error);
			dialog.showMessageBox({
				type: "error",
				title: "Update Error",
				message: "Failed to check for updates. Please try again later.",
			});
		});
}

export function setupAutoUpdater(): void {
	if (ENVIRONMENT.IS_DEV || !PLATFORM.IS_MAC) {
		return;
	}

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.allowDowngrade = false;

	autoUpdater.setFeedURL({
		provider: "generic",
		url: UPDATE_FEED_URL,
	});

	autoUpdater.on("error", (error) => {
		console.error("[auto-updater] Error during update check:", error);
	});

	autoUpdater.on("update-available", (info) => {
		console.info(
			`[auto-updater] Update available: ${info.version}. Downloading...`,
		);
	});

	autoUpdater.on("update-not-available", () => {
		console.info("[auto-updater] No updates available");
	});

	autoUpdater.on("update-downloaded", (info) => {
		if (isUpdateDialogOpen) {
			console.info("[auto-updater] Update dialog already open, skipping");
			return;
		}

		console.info(
			`[auto-updater] Update downloaded (${info.version}). Prompting user to restart.`,
		);

		isUpdateDialogOpen = true;

		const dialogOptions = {
			type: "info" as const,
			buttons: ["Restart Now", "Later"],
			defaultId: 0,
			cancelId: 1,
			title: "Update Ready",
			message: `Version ${info.version} is ready to install`,
			detail:
				"A new version has been downloaded. Restart the application to apply the update.",
		};

		const showDialog = mainWindow
			? dialog.showMessageBox(mainWindow, dialogOptions)
			: dialog.showMessageBox(dialogOptions);

		showDialog
			.then((response) => {
				isUpdateDialogOpen = false;
				if (response.response === 0) {
					autoUpdater.quitAndInstall(false, true);
				}
			})
			.catch((error) => {
				isUpdateDialogOpen = false;
				console.error("[auto-updater] Failed to show update dialog:", error);
			});
	});

	const interval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
	interval.unref();

	if (app.isReady()) {
		void checkForUpdates();
	} else {
		app
			.whenReady()
			.then(() => checkForUpdates())
			.catch((error) => {
				console.error("[auto-updater] Failed to start update checks:", error);
			});
	}
}
