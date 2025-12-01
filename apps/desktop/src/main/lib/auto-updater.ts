import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { ENVIRONMENT, PLATFORM } from "shared/constants";

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 1; // 1 hour
const UPDATE_FEED_URL =
	"https://github.com/superset-sh/superset/releases/latest/download";

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
		console.info(
			`[auto-updater] Update downloaded (${info.version}). Will install on quit.`,
		);
	});

	const checkForUpdates = () =>
		autoUpdater.checkForUpdatesAndNotify().catch((error) => {
			console.error("[auto-updater] Failed to check for updates:", error);
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
