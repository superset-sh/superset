import { EventEmitter } from "node:events";
import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { prerelease } from "semver";
import { env } from "main/env.main";
import { setSkipQuitConfirmation } from "main/index";
import { AUTO_UPDATE_STATUS, type AutoUpdateStatus } from "shared/auto-update";
import { PLATFORM } from "shared/constants";

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4; // 4 hours

/**
 * Detect update channel from app version using semver.
 * Versions like "0.0.53-canary" have prerelease component ["canary"].
 * Stable versions like "0.0.53" have no prerelease component.
 */
function getUpdateChannel(): string {
	const version = app.getVersion();
	const prereleaseComponents = prerelease(version);
	if (prereleaseComponents && prereleaseComponents.length > 0) {
		// Return first prerelease identifier (e.g., "canary", "beta", "alpha")
		return String(prereleaseComponents[0]);
	}
	return "latest";
}

const UPDATE_CHANNEL = getUpdateChannel();
const IS_PRERELEASE = UPDATE_CHANNEL !== "latest";

export interface AutoUpdateStatusEvent {
	status: AutoUpdateStatus;
	version?: string;
	error?: string;
}

export const autoUpdateEmitter = new EventEmitter();

let currentStatus: AutoUpdateStatus = AUTO_UPDATE_STATUS.IDLE;
let currentVersion: string | undefined;
let isDismissed = false;

function emitStatus(
	status: AutoUpdateStatus,
	version?: string,
	error?: string,
): void {
	currentStatus = status;
	currentVersion = version;

	if (isDismissed && status === AUTO_UPDATE_STATUS.READY) {
		return;
	}

	autoUpdateEmitter.emit("status-changed", { status, version, error });
}

export function getUpdateStatus(): AutoUpdateStatusEvent {
	if (isDismissed && currentStatus === AUTO_UPDATE_STATUS.READY) {
		return { status: AUTO_UPDATE_STATUS.IDLE };
	}
	return { status: currentStatus, version: currentVersion };
}

export function installUpdate(): void {
	if (env.NODE_ENV === "development") {
		console.info("[auto-updater] Install skipped in dev mode");
		emitStatus(AUTO_UPDATE_STATUS.IDLE);
		return;
	}
	// Skip confirmation dialog - quitAndInstall internally calls app.quit()
	setSkipQuitConfirmation();
	autoUpdater.quitAndInstall(false, true);
}

export function dismissUpdate(): void {
	isDismissed = true;
	autoUpdateEmitter.emit("status-changed", { status: AUTO_UPDATE_STATUS.IDLE });
}

export function checkForUpdates(): void {
	if (env.NODE_ENV === "development" || !PLATFORM.IS_MAC) {
		return;
	}
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.CHECKING);
	autoUpdater.checkForUpdates().catch((error) => {
		console.error("[auto-updater] Failed to check for updates:", error);
		emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
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

	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.CHECKING);

	autoUpdater
		.checkForUpdates()
		.then((result) => {
			if (
				!result?.updateInfo ||
				result.updateInfo.version === app.getVersion()
			) {
				emitStatus(AUTO_UPDATE_STATUS.IDLE);
				dialog.showMessageBox({
					type: "info",
					title: "No Updates",
					message: "You're up to date!",
					detail: `Version ${app.getVersion()} is the latest version.`,
				});
			}
		})
		.catch((error) => {
			console.error("[auto-updater] Failed to check for updates:", error);
			emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
			dialog.showMessageBox({
				type: "error",
				title: "Update Error",
				message: "Failed to check for updates. Please try again later.",
			});
		});
}

export function simulateUpdateReady(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.READY, "99.0.0-test");
}

export function simulateDownloading(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.DOWNLOADING, "99.0.0-test");
}

export function simulateError(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(
		AUTO_UPDATE_STATUS.ERROR,
		undefined,
		"Simulated error for testing",
	);
}

export function setupAutoUpdater(): void {
	if (env.NODE_ENV === "development" || !PLATFORM.IS_MAC) {
		return;
	}

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;

	// Set update channel based on version (e.g., "canary" for 0.0.53-canary, "latest" for 0.0.53)
	// This determines which manifest file to check (canary-mac.yml vs latest-mac.yml)
	autoUpdater.channel = UPDATE_CHANNEL;

	// Allow downgrade for prerelease builds so users can switch back to stable
	autoUpdater.allowDowngrade = IS_PRERELEASE;

	console.info(
		`[auto-updater] Configured for channel: ${UPDATE_CHANNEL}, allowDowngrade: ${IS_PRERELEASE}`,
	);

	autoUpdater.on("error", (error) => {
		console.error("[auto-updater] Error during update check:", error);
		emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
	});

	autoUpdater.on("checking-for-update", () => {
		console.info("[auto-updater] Checking for updates...");
		emitStatus(AUTO_UPDATE_STATUS.CHECKING);
	});

	autoUpdater.on("update-available", (info) => {
		console.info(
			`[auto-updater] Update available: ${info.version}. Downloading...`,
		);
		emitStatus(AUTO_UPDATE_STATUS.DOWNLOADING, info.version);
	});

	autoUpdater.on("update-not-available", () => {
		console.info("[auto-updater] No updates available");
		emitStatus(AUTO_UPDATE_STATUS.IDLE);
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
		emitStatus(AUTO_UPDATE_STATUS.READY, info.version);
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
