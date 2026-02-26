import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { settings } from "@superset/local-db";
import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	getRingtoneFilename,
} from "../../shared/ringtones";
import { getCustomRingtonePath } from "./custom-ringtones";
import { localDb } from "./local-db";
import { getSoundPath } from "./sound-paths";

const DND_CACHE_TTL_MS = 5000;
let dndCacheValue: boolean | null = null;
let dndCacheTimestamp = 0;
let dndRefreshInFlight: Promise<boolean> | null = null;

function logDebug(message: string, data?: Record<string, unknown>): void {
	if (data) {
		console.log(`[notification-sound][debug] ${message}`, data);
		return;
	}
	console.log(`[notification-sound][debug] ${message}`);
}

function isFreshDndCache(): boolean {
	return Date.now() - dndCacheTimestamp < DND_CACHE_TTL_MS;
}

type MacNotificationStateModule = {
	getDoNotDisturb: () => Promise<boolean>;
};

async function isMacDoNotDisturbEnabled(): Promise<boolean> {
	try {
		const mod =
			require("macos-notification-state") as MacNotificationStateModule;
		const isDnd = await mod.getDoNotDisturb();
		logDebug("macOS DND state read", { isDnd });
		return isDnd;
	} catch (error) {
		logDebug("macOS DND detection failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

type WindowsNotificationState =
	| "QUNS_NOT_PRESENT"
	| "QUNS_BUSY"
	| "QUNS_RUNNING_D3D_FULL_SCREEN"
	| "QUNS_PRESENTATION_MODE"
	| "QUNS_ACCEPTS_NOTIFICATIONS"
	| "QUNS_QUIET_TIME"
	| "QUNS_APP"
	| "UNKNOWN_ERROR";

type WindowsNotificationStateModule = {
	getNotificationState: () => WindowsNotificationState;
};

function isWindowsDoNotDisturbEnabled(): boolean {
	try {
		const mod =
			require("windows-notification-state") as WindowsNotificationStateModule;
		const state = mod.getNotificationState();
		const isDnd =
			state === "QUNS_BUSY" ||
			state === "QUNS_RUNNING_D3D_FULL_SCREEN" ||
			state === "QUNS_PRESENTATION_MODE" ||
			state === "QUNS_QUIET_TIME";
		logDebug("Windows DND state read", { state, isDnd });
		return isDnd;
	} catch (error) {
		logDebug("Windows DND detection failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

function isLinuxDoNotDisturbEnabled(): boolean {
	try {
		const output = execFileSync(
			"gsettings",
			["get", "org.gnome.desktop.notifications", "show-banners"],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 200,
			},
		)
			.trim()
			.toLowerCase();

		// show-banners=false indicates DND-style suppression in GNOME.
		const isDnd = output === "false";
		logDebug("Linux DND state read", { output, isDnd });
		return isDnd;
	} catch (error) {
		logDebug("Linux DND detection failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

async function detectDoNotDisturb(): Promise<boolean> {
	logDebug("Detecting DND state", { platform: process.platform });
	if (process.platform === "darwin") {
		return isMacDoNotDisturbEnabled();
	}
	if (process.platform === "win32") {
		return isWindowsDoNotDisturbEnabled();
	}
	if (process.platform === "linux") {
		return isLinuxDoNotDisturbEnabled();
	}
	return false;
}

function refreshDoNotDisturbCache(): Promise<boolean> {
	if (dndRefreshInFlight) {
		logDebug("Reusing in-flight DND refresh");
		return dndRefreshInFlight;
	}
	logDebug("Refreshing DND cache");

	dndRefreshInFlight = detectDoNotDisturb()
		.then((isDnd) => {
			dndCacheValue = isDnd;
			dndCacheTimestamp = Date.now();
			logDebug("DND cache refreshed", { isDnd, timestamp: dndCacheTimestamp });
			return isDnd;
		})
		.catch((error) => {
			if (dndCacheValue === null) {
				dndCacheValue = false;
				dndCacheTimestamp = Date.now();
			}
			logDebug("DND refresh failed, using fallback cache", {
				error: error instanceof Error ? error.message : String(error),
				fallbackValue: dndCacheValue,
			});
			return dndCacheValue;
		})
		.finally(() => {
			dndRefreshInFlight = null;
			logDebug("DND refresh completed");
		});

	return dndRefreshInFlight;
}

/**
 * Returns whether notification sounds should be muted.
 */
export function areNotificationSoundsMuted(): boolean {
	try {
		const settingsRow = localDb.select().from(settings).get();
		const muted = settingsRow?.notificationSoundsMuted ?? false;
		logDebug("Read notification mute setting", { muted });
		return muted;
	} catch (error) {
		logDebug("Failed reading mute setting; defaulting to false", {
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

/**
 * Gets the selected ringtone path from the database.
 * Falls back to default ringtone if the stored ID is invalid/stale.
 */
function getSelectedRingtonePath(): string | null {
	const defaultFilename = getRingtoneFilename(DEFAULT_RINGTONE_ID);
	const defaultPath = getSoundPath(defaultFilename);

	try {
		const settingsRow = localDb.select().from(settings).get();
		const selectedId = settingsRow?.selectedRingtoneId ?? DEFAULT_RINGTONE_ID;
		logDebug("Resolved selected ringtone ID", { selectedId });

		// Legacy: "none" was previously used before the muted toggle existed.
		if (selectedId === "none") {
			logDebug("Ringtone ID is legacy 'none'; skipping sound");
			return null;
		}

		if (selectedId === CUSTOM_RINGTONE_ID) {
			const customPath = getCustomRingtonePath() ?? defaultPath;
			logDebug("Using custom ringtone path", { path: customPath });
			return customPath;
		}

		const filename = getRingtoneFilename(selectedId);
		const resolvedPath = filename ? getSoundPath(filename) : defaultPath;
		logDebug("Using built-in ringtone path", {
			filename: filename ?? "(default fallback)",
			path: resolvedPath,
		});
		return resolvedPath;
	} catch (error) {
		logDebug("Failed resolving ringtone path; using default", {
			error: error instanceof Error ? error.message : String(error),
			path: defaultPath,
		});
		return defaultPath;
	}
}

/**
 * Plays a sound file using platform-specific commands.
 */
function playSoundFile(soundPath: string): void {
	if (!existsSync(soundPath)) {
		console.warn(`[notification-sound] Sound file not found: ${soundPath}`);
		return;
	}
	logDebug("Playing sound file", { soundPath, platform: process.platform });

	if (process.platform === "darwin") {
		logDebug("Executing afplay");
		execFile("afplay", [soundPath]);
	} else if (process.platform === "win32") {
		logDebug("Executing PowerShell SoundPlayer");
		execFile("powershell", [
			"-c",
			`(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`,
		]);
	} else {
		logDebug("Executing paplay/aplay fallback");
		execFile("paplay", [soundPath], (error) => {
			if (error) {
				logDebug("paplay failed; falling back to aplay", {
					error: error.message,
				});
				execFile("aplay", [soundPath]);
			}
		});
	}
}

/**
 * Plays custom notification sound unless muted or OS do-not-disturb is active.
 */
export function playNotificationSound(): void {
	logDebug("playNotificationSound invoked");
	if (areNotificationSoundsMuted()) {
		logDebug("Skipping sound because notifications are muted");
		return;
	}

	const soundPath = getSelectedRingtonePath();
	if (!soundPath) {
		logDebug("Skipping sound because no ringtone path resolved");
		return;
	}

	if (dndCacheValue !== null && isFreshDndCache()) {
		logDebug("Using fresh DND cache", { dndCacheValue });
		if (!dndCacheValue) {
			playSoundFile(soundPath);
		} else {
			logDebug("Skipping sound because DND cache is true");
		}
		return;
	}

	if (dndCacheValue !== null) {
		// Serve immediately from stale cache to keep notifications snappy.
		logDebug("Using stale DND cache and refreshing", { dndCacheValue });
		if (!dndCacheValue) {
			playSoundFile(soundPath);
		} else {
			logDebug("Skipping immediate sound because stale DND cache is true");
		}
		// Refresh in background for subsequent notifications.
		void refreshDoNotDisturbCache();
		return;
	}

	// First notification: ensure we establish cache before playing.
	logDebug("No DND cache yet; refreshing before first play");
	void refreshDoNotDisturbCache().then((isDnd) => {
		logDebug("First-play DND result resolved", { isDnd });
		if (!isDnd) {
			playSoundFile(soundPath);
		} else {
			logDebug("Skipping first-play sound because DND is true");
		}
	});
}
