import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { settings } from "@superset/local-db";
import { DEFAULT_NOTIFICATION_SOUND_VOLUME } from "../../shared/constants";
import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	getRingtoneFilename,
} from "../../shared/ringtones";
import { getCustomRingtonePath } from "./custom-ringtones";
import { localDb } from "./local-db";
import { getSoundPath } from "./sound-paths";

/**
 * Checks if notification sounds are muted.
 */
function areNotificationSoundsMuted(): boolean {
	try {
		const settingsRow = localDb.select().from(settings).get();
		return settingsRow?.notificationSoundsMuted ?? false;
	} catch {
		return false;
	}
}

/**
 * Gets the notification sound volume (0–100) from settings.
 */
function getNotificationSoundVolume(): number {
	try {
		const settingsRow = localDb.select().from(settings).get();
		return (
			settingsRow?.notificationSoundVolume ?? DEFAULT_NOTIFICATION_SOUND_VOLUME
		);
	} catch {
		return DEFAULT_NOTIFICATION_SOUND_VOLUME;
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

		// Legacy: "none" was previously used before the muted toggle existed
		if (selectedId === "none") {
			return null;
		}

		if (selectedId === CUSTOM_RINGTONE_ID) {
			return getCustomRingtonePath() ?? defaultPath;
		}

		const filename = getRingtoneFilename(selectedId);
		// Fall back to default if stored ID is stale/unknown
		return filename ? getSoundPath(filename) : defaultPath;
	} catch {
		return defaultPath;
	}
}

/**
 * Builds the afplay volume argument for macOS.
 * Maps 0–100 percent to 0.0–1.0 (afplay's native range).
 */
export function toAfplayVolume(percent: number): number {
	const clamped = Math.max(0, Math.min(100, percent));
	return clamped / 100;
}

/**
 * Builds the paplay volume argument for Linux.
 * Maps 0–100 percent to 0–65536 (PulseAudio's PA_VOLUME_NORM).
 */
export function toPaplayVolume(percent: number): number {
	const clamped = Math.max(0, Math.min(100, percent));
	return Math.round((clamped / 100) * 65536);
}

/**
 * Plays a sound file using platform-specific commands, with volume support.
 */
export function playSoundFile(
	soundPath: string,
	volume = DEFAULT_NOTIFICATION_SOUND_VOLUME,
): void {
	if (!existsSync(soundPath)) {
		console.warn(`[notification-sound] Sound file not found: ${soundPath}`);
		return;
	}

	if (process.platform === "darwin") {
		const afplayVolume = toAfplayVolume(volume);
		execFile("afplay", [soundPath, "-v", String(afplayVolume)]);
	} else if (process.platform === "win32") {
		execFile("powershell", [
			"-c",
			`(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`,
		]);
	} else {
		// Linux - try common audio players
		const paplayVolume = toPaplayVolume(volume);
		execFile("paplay", [`--volume=${paplayVolume}`, soundPath], (error) => {
			if (error) {
				execFile("aplay", [soundPath]);
			}
		});
	}
}

/**
 * Plays the notification sound based on user's selected ringtone.
 * Uses platform-specific commands to play the audio file.
 */
export function playNotificationSound(): void {
	// Check if sounds are muted
	if (areNotificationSoundsMuted()) {
		return;
	}

	const soundPath = getSelectedRingtonePath();

	// No sound if "none" is selected
	if (!soundPath) {
		return;
	}

	const volume = getNotificationSoundVolume();
	playSoundFile(soundPath, volume);
}
