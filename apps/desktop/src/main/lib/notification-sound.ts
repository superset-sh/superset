import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { settings } from "@superset/local-db";
import {
	DEFAULT_RINGTONE_ID,
	getRingtoneFilename,
} from "../../shared/ringtones";
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
 * Gets the selected ringtone filename from the database.
 * Falls back to default ringtone if the stored ID is invalid/stale.
 */
function getSelectedRingtoneFilename(): string {
	const defaultFilename = getRingtoneFilename(DEFAULT_RINGTONE_ID);

	try {
		const settingsRow = localDb.select().from(settings).get();
		const selectedId = settingsRow?.selectedRingtoneId ?? DEFAULT_RINGTONE_ID;

		// Legacy: "none" was previously used before the muted toggle existed
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
	// Check if sounds are muted
	if (areNotificationSoundsMuted()) {
		return;
	}

	const filename = getSelectedRingtoneFilename();

	// No sound if "none" is selected
	if (!filename) {
		return;
	}

	const soundPath = getSoundPath(filename);
	playSoundFile(soundPath);
}
