import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
	DEFAULT_RINGTONE_ID,
	getRingtoneFilename,
} from "../../shared/ringtones";
import { db } from "./db";
import { getSoundPath } from "./sound-paths";

/**
 * Gets the selected ringtone filename from the database.
 * Falls back to default ringtone if the stored ID is invalid/stale.
 */
function getSelectedRingtoneFilename(): string {
	const defaultFilename = getRingtoneFilename(DEFAULT_RINGTONE_ID);

	try {
		const selectedId =
			db.data.settings.selectedRingtoneId ?? DEFAULT_RINGTONE_ID;

		// "none" means silent - return empty string intentionally
		if (selectedId === "none") {
			return "";
		}

		const filename = getRingtoneFilename(selectedId);
		// Fall back to default if stored ID is stale/unknown
		return filename || defaultFilename;
	} catch {
		return defaultFilename;
	}
}

/**
 * Plays a sound file using platform-specific commands
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
		// Linux - try common audio players
		execFile("paplay", [soundPath], (error) => {
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
	const filename = getSelectedRingtoneFilename();

	// No sound if "none" is selected
	if (!filename) {
		return;
	}

	const soundPath = getSoundPath(filename);
	playSoundFile(soundPath);
}
