import { EventEmitter } from "node:events";
import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { env } from "main/env.main";
import { setSkipQuitConfirmation } from "main/index";
import { prerelease } from "semver";
import { AUTO_UPDATE_STATUS, type AutoUpdateStatus } from "shared/auto-update";
import { PLATFORM } from "shared/constants";

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4; // 4 hours

/**
 * Detect if this is a prerelease build from app version using semver.
 * Versions like "0.0.53-canary" have prerelease component ["canary"].
 * Stable versions like "0.0.53" have no prerelease component.
 */
function isPrereleaseBuild(): boolean {
	const version = app.getVersion();
	const prereleaseComponents = prerelease(version);
	return prereleaseComponents !== null && prereleaseComponents.length > 0;
}

const IS_PRERELEASE = isPrereleaseBuild();

// Use explicit feed URLs to ensure we always fetch latest-mac.yml from the correct release
// - Stable: fetches from /releases/latest/download/ (latest non-prerelease)
// - Canary: fetches from /releases/download/desktop-canary/ (rolling canary tag)
const UPDATE_FEED_URL = IS_PRERELEASE
	? "https://github.com/superset-sh/superset/releases/download/desktop-canary"
	: "https://github.com/superset-sh/superset/releases/latest/download";

export interface AutoUpdateStatusEvent {
	status: AutoUpdateStatus;
	version?: string;
	error?: string;
}

export const autoUpdateEmitter = new EventEmitter();

// Network errors that don't need to be shown to the user
// These are transient/expected and will resolve on retry
const SILENT_ERROR_PATTERNS = [
	"net::ERR_INTERNET_DISCONNECTED",
	"net::ERR_NETWORK_CHANGED",
	"net::ERR_CONNECTION_REFUSED",
	"net::ERR_NAME_NOT_RESOLVED",
	"net::ERR_CONNECTION_TIMED_OUT",
	"net::ERR_CONNECTION_RESET",
	"ENOTFOUND",
	"ETIMEDOUT",
	"ECONNREFUSED",
	"ECONNRESET",
];

function isNetworkError(error: Error | string): boolean {
	const message = typeof error === "string" ? error : error.message;
	return SILENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

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
		if (isNetworkError(error)) {
			console.info("[auto-updater] Network unavailable, will retry later");
			emitStatus(AUTO_UPDATE_STATUS.IDLE);
			return;
		}
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
			if (isNetworkError(error)) {
				console.info("[auto-updater] Network unavailable");
				emitStatus(AUTO_UPDATE_STATUS.IDLE);
				dialog.showMessageBox({
					type: "info",
					title: "No Internet Connection",
					message:
						"Unable to check for updates. Please check your internet connection.",
				});
				return;
			}
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
	autoUpdater.disableDifferentialDownload = true;

	// Allow downgrade for prerelease builds so users can switch back to stable
	autoUpdater.allowDowngrade = IS_PRERELEASE;

	// Use generic provider with explicit feed URL
	// This ensures we always fetch latest-mac.yml from the correct GitHub release
	autoUpdater.setFeedURL({
		provider: "generic",
		url: UPDATE_FEED_URL,
	});

	console.info(
		`[auto-updater] Initialized: version=${app.getVersion()}, channel=${IS_PRERELEASE ? "canary" : "stable"}, feedURL=${UPDATE_FEED_URL}`,
	);

	autoUpdater.on("error", (error) => {
		if (isNetworkError(error)) {
			console.info("[auto-updater] Network unavailable, will retry later");
			emitStatus(AUTO_UPDATE_STATUS.IDLE);
			return;
		}
		console.error(
			`[auto-updater] Error during update (currentVersion=${app.getVersion()}):`,
			error?.message || error,
		);
		emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
	});

	autoUpdater.on("checking-for-update", () => {
		console.info(
			`[auto-updater] Checking for updates... (currentVersion=${app.getVersion()}, feedURL=${UPDATE_FEED_URL})`,
		);
		emitStatus(AUTO_UPDATE_STATUS.CHECKING);
	});

	autoUpdater.on("update-available", (info) => {
		console.info(
			`[auto-updater] Update available: ${app.getVersion()} → ${info.version} (files: ${info.files?.map((f: { url: string }) => f.url).join(", ")})`,
		);
		emitStatus(AUTO_UPDATE_STATUS.DOWNLOADING, info.version);
	});

	autoUpdater.on("update-not-available", (info) => {
		console.info(
			`[auto-updater] No updates available (currentVersion=${app.getVersion()}, latestVersion=${info.version})`,
		);
		emitStatus(AUTO_UPDATE_STATUS.IDLE);
	});

	autoUpdater.on("download-progress", (progress) => {
		console.info(
			`[auto-updater] Download progress: ${progress.percent.toFixed(1)}% (${(progress.transferred / 1024 / 1024).toFixed(1)}MB / ${(progress.total / 1024 / 1024).toFixed(1)}MB)`,
		);
	});

	autoUpdater.on("update-downloaded", (info) => {
		console.info(
			`[auto-updater] Update downloaded: ${app.getVersion()} → ${info.version}. Ready to install.`,
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
