import { EventEmitter } from "node:events";
import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { env } from "main/env.main";
import { PLATFORM } from "shared/constants";

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4; // 4 hours
const UPDATE_FEED_URL =
	"https://github.com/superset-sh/superset/releases/latest/download";
const RELEASES_URL = "https://github.com/superset-sh/superset/releases";

export interface UpdateDownloadedEvent {
	version: string;
}

export const autoUpdateEmitter = new EventEmitter();

let hasNotifiedUpdateDownloaded = false;

export function installUpdate(): void {
	autoUpdater.quitAndInstall(false, true);
}

export function checkForUpdates(): void {
	if (env.NODE_ENV === "development" || !PLATFORM.IS_MAC) {
		return;
	}
	autoUpdater.checkForUpdates().catch((error) => {
		console.error("[auto-updater] Failed to check for updates:", error);
	});
}

export function checkForUpdatesInteractive(): void {
	if (env.NODE_ENV === "development") {
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
				autoUpdateEmitter.emit("update-not-available");
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
	if (env.NODE_ENV === "development" || !PLATFORM.IS_MAC) {
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
		if (hasNotifiedUpdateDownloaded) {
			console.info("[auto-updater] Already notified about update, skipping");
			return;
		}

		console.info(
			`[auto-updater] Update downloaded (${info.version}). Notifying renderer.`,
		);

		hasNotifiedUpdateDownloaded = true;

		autoUpdateEmitter.emit("update-downloaded", { version: info.version });
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
