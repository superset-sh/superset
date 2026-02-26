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

function execFileOutput(
	command: string,
	args: string[],
): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(command, args, { windowsHide: true }, (error, stdout) => {
			if (error) {
				resolve(null);
				return;
			}
			resolve(stdout.trim());
		});
	});
}

function parseSimpleBoolean(value: string): boolean | undefined {
	const normalized = value.trim().toLowerCase();
	if (normalized === "1" || normalized === "true" || normalized === "yes") {
		return true;
	}
	if (normalized === "0" || normalized === "false" || normalized === "no") {
		return false;
	}
	return undefined;
}

function parseMacDndOutput(value: string): boolean | undefined {
	const direct = parseSimpleBoolean(value);
	if (direct !== undefined) return direct;

	if (
		/\b(doNotDisturb|dnd|active|enabled)\s*=\s*1\b/i.test(value) ||
		/\b(doNotDisturb|dnd)\b/i.test(value)
	) {
		return true;
	}

	if (/\b(doNotDisturb|dnd|active|enabled)\s*=\s*0\b/i.test(value)) {
		return false;
	}

	return undefined;
}

async function isMacDoNotDisturbEnabled(): Promise<boolean> {
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
		const output = await execFileOutput(command, args);
		if (!output) continue;
		const parsed = parseMacDndOutput(output);
		if (parsed !== undefined) return parsed;
	}

	return false;
}

async function isWindowsDoNotDisturbEnabled(): Promise<boolean> {
	const output = await execFileOutput("powershell", [
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		[
			"$quiet=(Get-ItemProperty -Path HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\QuietHours -Name QuietHoursActive -ErrorAction SilentlyContinue).QuietHoursActive",
			"$toasts=(Get-ItemProperty -Path HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings -Name NOC_GLOBAL_SETTING_TOASTS_ENABLED -ErrorAction SilentlyContinue).NOC_GLOBAL_SETTING_TOASTS_ENABLED",
			"if ($quiet -eq 1 -or $toasts -eq 0) { '1' } else { '0' }",
		].join("; "),
	]);

	if (!output) return false;
	return parseSimpleBoolean(output) ?? false;
}

async function isLinuxDoNotDisturbEnabled(): Promise<boolean> {
	const output = await execFileOutput("gsettings", [
		"get",
		"org.gnome.desktop.notifications",
		"show-banners",
	]);

	if (!output) return false;
	const parsed = parseSimpleBoolean(output);
	if (parsed === undefined) return false;
	return !parsed;
}

async function isDoNotDisturbEnabled(): Promise<boolean> {
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
		execFile("powershell", [
			"-c",
			`(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`,
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

	void isDoNotDisturbEnabled()
		.then((isDnd) => {
			if (isDnd) return;
			playSoundFile(soundPath);
		})
		.catch(() => {
			// DND detection is best-effort. If detection fails, play the sound.
			playSoundFile(soundPath);
		});
}
