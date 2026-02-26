import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
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

const debugNotificationSoundOverride =
	process.env.SUPERSET_DEBUG_NOTIFICATION_SOUND?.trim();
const DEBUG_NOTIFICATION_SOUND_ENABLED =
	debugNotificationSoundOverride === undefined
		? process.env.NODE_ENV === "development"
		: !/^(0|false)$/i.test(debugNotificationSoundOverride);

function logDebug(message: string, context?: Record<string, unknown>): void {
	if (!DEBUG_NOTIFICATION_SOUND_ENABLED) return;
	if (context) {
		console.log(`[notification-sound] ${message}`, context);
		return;
	}
	console.log(`[notification-sound] ${message}`);
}

function summarizeSoundPath(soundPath: string): string {
	return basename(soundPath);
}

function isFreshDndCache(): boolean {
	return Date.now() - dndCacheTimestamp < DND_CACHE_TTL_MS;
}

function execFileOutput(
	command: string,
	args: string[],
	timeout: number,
): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(
			command,
			args,
			{ encoding: "utf8", timeout, windowsHide: true },
			(error, stdout) => {
				if (error) {
					logDebug("Probe command failed", {
						command,
						args,
						error: error.message,
					});
					resolve(null);
					return;
				}
				const output = stdout.trim();
				logDebug("Probe command output", {
					command,
					args,
					output: output.length > 160 ? `${output.slice(0, 160)}...` : output,
				});
				resolve(output);
			},
		);
	});
}

function parseMacDefaultsDnd(output: string): boolean | undefined {
	const normalized = output.trim().toLowerCase();
	if (normalized === "1" || normalized === "true") {
		return true;
	}
	if (normalized === "0" || normalized === "false") {
		return false;
	}

	// Plist-style output patterns.
	if (
		/\b(enabled|active|donotdisturb)\s*=\s*1\b/i.test(output) ||
		/\bcom\.apple\.donotdisturb\.mode\.default\b/i.test(output)
	) {
		return true;
	}
	if (/\b(enabled|active|donotdisturb)\s*=\s*0\b/i.test(output)) {
		return false;
	}

	return undefined;
}

async function readMacDoNotDisturbFromDefaults(): Promise<boolean | undefined> {
	const commands: Array<[string, string[]]> = [
		[
			"defaults",
			[
				"-currentHost",
				"read",
				"com.apple.notificationcenterui",
				"doNotDisturb",
			],
		],
		[
			"defaults",
			["-currentHost", "read", "com.apple.controlcenter", "FocusModes"],
		],
		["defaults", ["read", "com.apple.controlcenter", "FocusModes"]],
	];

	for (const [command, args] of commands) {
		const output = await execFileOutput(command, args, 250);
		if (!output) continue;
		const parsed = parseMacDefaultsDnd(output);
		logDebug("Parsed macOS defaults probe", {
			command,
			args,
			parsed,
		});
		if (parsed !== undefined) {
			return parsed;
		}
	}

	return undefined;
}

async function isMacDoNotDisturbEnabled(): Promise<boolean> {
	const fallback = await readMacDoNotDisturbFromDefaults();
	if (fallback !== undefined) {
		logDebug("macOS DND probe resolved", { isDnd: fallback });
		return fallback;
	}
	// If detection fails entirely, allow sound instead of suppressing forever.
	logDebug("macOS DND probe unavailable, defaulting to sound allowed");
	return false;
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
		logDebug("Windows notification state", { state, isDnd });
		return isDnd;
	} catch (error) {
		logDebug("Windows DND probe failed, defaulting to not DND", {
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

async function isLinuxDoNotDisturbEnabled(): Promise<boolean> {
	const output = await execFileOutput(
		"gsettings",
		["get", "org.gnome.desktop.notifications", "show-banners"],
		200,
	);
	if (!output) {
		logDebug("Linux DND probe unavailable, defaulting to not DND");
		return false;
	}

	// show-banners=false indicates DND-style suppression in GNOME.
	const isDnd = output.toLowerCase() === "false";
	logDebug("Linux DND probe resolved", { output, isDnd });
	return isDnd;
}

async function detectDoNotDisturb(): Promise<boolean> {
	let isDnd = false;
	if (process.platform === "darwin") {
		isDnd = await isMacDoNotDisturbEnabled();
	} else if (process.platform === "win32") {
		isDnd = isWindowsDoNotDisturbEnabled();
	} else if (process.platform === "linux") {
		isDnd = await isLinuxDoNotDisturbEnabled();
	}
	logDebug("DND detection complete", { platform: process.platform, isDnd });
	return isDnd;
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
			logDebug("DND cache updated", { isDnd });
			return isDnd;
		})
		.catch((error) => {
			if (dndCacheValue === null) {
				dndCacheValue = false;
				dndCacheTimestamp = Date.now();
			}
			logDebug("DND refresh failed, using existing/default cache", {
				error: error instanceof Error ? error.message : String(error),
				isDnd: dndCacheValue,
			});
			return dndCacheValue;
		})
		.finally(() => {
			dndRefreshInFlight = null;
			logDebug("DND refresh complete");
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
		logDebug("Notification mute setting read", { muted });
		return muted;
	} catch {
		logDebug("Failed reading mute setting, defaulting to unmuted");
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

		// Legacy: "none" was previously used before the muted toggle existed.
		if (selectedId === "none") {
			logDebug("Ringtone disabled via legacy 'none' selection");
			return null;
		}

		if (selectedId === CUSTOM_RINGTONE_ID) {
			const customPath = getCustomRingtonePath() ?? defaultPath;
			logDebug("Selected custom ringtone", {
				filename: summarizeSoundPath(customPath),
			});
			return customPath;
		}

		const filename = getRingtoneFilename(selectedId);
		const resolved = filename ? getSoundPath(filename) : defaultPath;
		logDebug("Selected built-in ringtone", {
			selectedId,
			filename: summarizeSoundPath(resolved),
		});
		return resolved;
	} catch {
		logDebug("Failed reading selected ringtone, defaulting", {
			filename: summarizeSoundPath(defaultPath),
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

	logDebug("Playing notification sound", {
		platform: process.platform,
		filename: summarizeSoundPath(soundPath),
	});

	if (process.platform === "darwin") {
		execFile("afplay", [soundPath]);
	} else if (process.platform === "win32") {
		const escapedPath = soundPath.replace(/'/g, "''");
		execFile("powershell", [
			"-c",
			`(New-Object Media.SoundPlayer '${escapedPath}').PlaySync()`,
		]);
	} else {
		execFile("paplay", [soundPath], (error) => {
			if (error) {
				execFile("aplay", [soundPath]);
			}
		});
	}
}

/**
 * Plays custom notification sound unless muted or OS do-not-disturb is active.
 */
export function playNotificationSound(): void {
	if (areNotificationSoundsMuted()) {
		logDebug("Skipping sound because notifications are muted");
		return;
	}

	const soundPath = getSelectedRingtonePath();
	if (!soundPath) {
		logDebug("Skipping sound because no ringtone is selected");
		return;
	}

	if (dndCacheValue !== null && isFreshDndCache()) {
		logDebug("Using fresh DND cache", { isDnd: dndCacheValue });
		if (!dndCacheValue) {
			playSoundFile(soundPath);
		} else {
			logDebug("Skipping sound because DND is enabled (fresh cache)");
		}
		return;
	}

	if (dndCacheValue !== null) {
		// Serve immediately from stale cache to keep notifications snappy.
		logDebug("Using stale DND cache and refreshing in background", {
			isDnd: dndCacheValue,
			ageMs: Date.now() - dndCacheTimestamp,
		});
		if (!dndCacheValue) {
			playSoundFile(soundPath);
		} else {
			logDebug("Skipping sound because DND is enabled (stale cache)");
		}
		// Refresh in background for subsequent notifications.
		void refreshDoNotDisturbCache();
		return;
	}

	// First notification: ensure we establish cache before playing.
	logDebug("No DND cache yet, probing before first sound");
	void refreshDoNotDisturbCache().then((isDnd) => {
		if (!isDnd) {
			playSoundFile(soundPath);
		} else {
			logDebug("Skipping sound because DND is enabled (first probe)");
		}
	});
}
