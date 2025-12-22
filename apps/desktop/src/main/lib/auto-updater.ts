import { EventEmitter } from "node:events";
import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { env } from "main/env.main";
import {
	AUTO_UPDATE_EVENTS,
	AUTO_UPDATE_STATUS,
	type AutoUpdateStatus,
	PLATFORM,
} from "shared/constants";

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4; // 4 hours
const UPDATE_FEED_URL =
	"https://github.com/superset-sh/superset/releases/latest/download";

// Event emitter for auto-update status changes
export const autoUpdateEmitter = new EventEmitter();

// Current update state
let currentStatus: AutoUpdateStatus = AUTO_UPDATE_STATUS.IDLE;
let currentVersion: string | undefined;
let currentError: string | undefined;
let isDismissed = false;

/**
 * Get the current update status
 */
export function getUpdateStatus(): {
	status: AutoUpdateStatus;
	version?: string;
	error?: string;
} {
	// If dismissed, report as idle to the UI
	if (isDismissed && currentStatus === AUTO_UPDATE_STATUS.READY) {
		return { status: AUTO_UPDATE_STATUS.IDLE };
	}
	return {
		status: currentStatus,
		version: currentVersion,
		error: currentError,
	};
}

/**
 * Emit a status change event
 */
function emitStatusChange(
	status: AutoUpdateStatus,
	version?: string,
	error?: string,
): void {
	currentStatus = status;
	currentVersion = version;
	currentError = error;

	// Don't emit if dismissed and status is ready
	if (isDismissed && status === AUTO_UPDATE_STATUS.READY) {
		return;
	}

	autoUpdateEmitter.emit(AUTO_UPDATE_EVENTS.STATUS_CHANGED, {
		status,
		version,
		error,
	});
}

/**
 * Install the update and restart
 */
export function installUpdate(): void {
	autoUpdater.quitAndInstall(false, true);
}

/**
 * Dismiss the update notification for this session
 */
export function dismissUpdate(): void {
	isDismissed = true;
	// Emit idle status to hide the toast
	autoUpdateEmitter.emit(AUTO_UPDATE_EVENTS.STATUS_CHANGED, {
		status: AUTO_UPDATE_STATUS.IDLE,
	});
}

/**
 * DEV ONLY: Simulate an update ready state for testing the UI
 */
export function simulateUpdateReady(): void {
	if (env.NODE_ENV !== "development") {
		console.warn("[auto-updater] simulateUpdateReady is only available in dev");
		return;
	}
	isDismissed = false;
	emitStatusChange(AUTO_UPDATE_STATUS.READY, "1.0.0-test");
}

export function checkForUpdates(): void {
	if (env.NODE_ENV === "development" || !PLATFORM.IS_MAC) {
		return;
	}
	isDismissed = false; // Reset dismissed state on new check
	emitStatusChange(AUTO_UPDATE_STATUS.CHECKING);
	autoUpdater.checkForUpdates().catch((error) => {
		console.error("[auto-updater] Failed to check for updates:", error);
		emitStatusChange(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
	});
}

export function checkForUpdatesInteractive(): void {
	if (env.NODE_ENV === "development" || !PLATFORM.IS_MAC) {
		return;
	}
	isDismissed = false; // Reset dismissed state on manual check
	emitStatusChange(AUTO_UPDATE_STATUS.CHECKING);
	autoUpdater.checkForUpdates().catch((error) => {
		console.error("[auto-updater] Failed to check for updates:", error);
		emitStatusChange(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
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
		emitStatusChange(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
	});

	autoUpdater.on("checking-for-update", () => {
		console.info("[auto-updater] Checking for updates...");
		emitStatusChange(AUTO_UPDATE_STATUS.CHECKING);
	});

	autoUpdater.on("update-available", (info) => {
		console.info(
			`[auto-updater] Update available: ${info.version}. Downloading...`,
		);
		emitStatusChange(AUTO_UPDATE_STATUS.DOWNLOADING, info.version);
	});

	autoUpdater.on("update-not-available", () => {
		console.info("[auto-updater] No updates available");
		emitStatusChange(AUTO_UPDATE_STATUS.IDLE);
	});

	autoUpdater.on("download-progress", (progress) => {
		console.info(
			`[auto-updater] Download progress: ${progress.percent.toFixed(1)}%`,
		);
	});

	autoUpdater.on("update-downloaded", (info) => {
		console.info(
			`[auto-updater] Update downloaded (${info.version}). Ready to install.`,
		);
		emitStatusChange(AUTO_UPDATE_STATUS.READY, info.version);
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
