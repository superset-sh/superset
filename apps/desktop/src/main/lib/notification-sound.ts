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
 * Plays a sound file using platform-specific commands
 * @param soundPath Path to the sound file
 * @param volume Volume level from 0-100
 */
function playSoundFile(soundPath: string, volume: number = 100): void {
	if (!existsSync(soundPath)) {
		console.warn(`[notification-sound] Sound file not found: ${soundPath}`);
		return;
	}

	// Convert volume from 0-100 to platform-specific values
	const volumeDecimal = volume / 100; // 0.0 to 1.0

	if (process.platform === "darwin") {
		// macOS: afplay -v accepts volume from 0.0 to higher (1.0 is normal)
		execFile("afplay", ["-v", volumeDecimal.toString(), soundPath]);
	} else if (process.platform === "win32") {
		// Windows: Media.SoundPlayer doesn't support volume control
		execFile("powershell", [
			"-c",
			`(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`,
		]);
	} else {
		// Linux: paplay --volume accepts 0-65536 (65536 = 100%)
		const paVolume = Math.round(volumeDecimal * 65536);
		execFile(
			"paplay",
			["--volume", paVolume.toString(), soundPath],
			(error) => {
				if (error) {
					// paplay failed, try aplay as fallback
					// Note: aplay doesn't support volume control
					// Respect volume=0 by not playing at all
					if (volume === 0) {
						return;
					}
					// For other volumes, play at system volume (can't be controlled)
					execFile("aplay", [soundPath]);
				}
			},
		);
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

	// Get volume from settings
	let volume = 100;
	try {
		const settingsRow = localDb.select().from(settings).get();
		volume = settingsRow?.notificationVolume ?? 100;
	} catch {
		// Use default volume if there's an error
		volume = 100;
	}

	playSoundFile(soundPath, volume);
}
