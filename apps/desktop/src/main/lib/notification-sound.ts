import { execFile } from "node:child_process";
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
					resolve(null);
					return;
				}
				resolve(stdout.trim());
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
		if (parsed !== undefined) {
			return parsed;
		}
	}

	return undefined;
}

async function isMacDoNotDisturbEnabled(): Promise<boolean> {
	const fallback = await readMacDoNotDisturbFromDefaults();
	if (fallback !== undefined) {
		return fallback;
	}
	// If detection fails entirely, allow sound instead of suppressing forever.
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
		return (
			state === "QUNS_BUSY" ||
			state === "QUNS_RUNNING_D3D_FULL_SCREEN" ||
			state === "QUNS_PRESENTATION_MODE" ||
			state === "QUNS_QUIET_TIME"
		);
	} catch {
		return false;
	}
}

async function isLinuxDoNotDisturbEnabled(): Promise<boolean> {
	const output = await execFileOutput(
		"gsettings",
		["get", "org.gnome.desktop.notifications", "show-banners"],
		200,
	);
	if (!output) return false;

	// show-banners=false indicates DND-style suppression in GNOME.
	return output.toLowerCase() === "false";
}

async function detectDoNotDisturb(): Promise<boolean> {
	if (process.platform === "darwin") {
		return isMacDoNotDisturbEnabled();
	}
	if (process.platform === "win32") {
		return isWindowsDoNotDisturbEnabled();
	}
	if (process.platform === "linux") {
		return await isLinuxDoNotDisturbEnabled();
	}
	return false;
}

function refreshDoNotDisturbCache(): Promise<boolean> {
	if (dndRefreshInFlight) {
		return dndRefreshInFlight;
	}

	dndRefreshInFlight = detectDoNotDisturb()
		.then((isDnd) => {
			dndCacheValue = isDnd;
			dndCacheTimestamp = Date.now();
			return isDnd;
		})
		.catch(() => {
			if (dndCacheValue === null) {
				dndCacheValue = false;
				dndCacheTimestamp = Date.now();
			}
			return dndCacheValue;
		})
		.finally(() => {
			dndRefreshInFlight = null;
		});

	return dndRefreshInFlight;
}

/**
 * Returns whether notification sounds should be muted.
 */
export function areNotificationSoundsMuted(): boolean {
	try {
		const settingsRow = localDb.select().from(settings).get();
		return settingsRow?.notificationSoundsMuted ?? false;
	} catch {
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
			return null;
		}

		if (selectedId === CUSTOM_RINGTONE_ID) {
			return getCustomRingtonePath() ?? defaultPath;
		}

		const filename = getRingtoneFilename(selectedId);
		return filename ? getSoundPath(filename) : defaultPath;
	} catch {
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
		return;
	}

	const soundPath = getSelectedRingtonePath();
	if (!soundPath) {
		return;
	}

	if (dndCacheValue !== null && isFreshDndCache()) {
		if (!dndCacheValue) {
			playSoundFile(soundPath);
		}
		return;
	}

	if (dndCacheValue !== null) {
		// Serve immediately from stale cache to keep notifications snappy.
		if (!dndCacheValue) {
			playSoundFile(soundPath);
		}
		// Refresh in background for subsequent notifications.
		void refreshDoNotDisturbCache();
		return;
	}

	// First notification: ensure we establish cache before playing.
	void refreshDoNotDisturbCache().then((isDnd) => {
		if (!isDnd) {
			playSoundFile(soundPath);
		}
	});
}
