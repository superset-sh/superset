import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
	DEFAULT_RINGTONE_ID,
	getRingtoneFilename,
} from "../../shared/ringtones";
import { store } from "./storage-manager";

/**
 * Gets the path to a ringtone sound file.
 * In development, reads from src/resources. In production, reads from the bundled resources.
 */
function getRingtonePath(filename: string): string {
	const isDev = !app.isPackaged;

	if (isDev) {
		return join(app.getAppPath(), "src/resources/sounds", filename);
	}
	return join(process.resourcesPath, "resources/sounds", filename);
}

/** Expected shape of zustand persisted state */
interface PersistedRingtoneState {
	state?: {
		selectedRingtoneId?: string;
	};
}

/**
 * Gets the selected ringtone filename from the store.
 * Handles the JSON string format used by zustand's persist middleware.
 * Falls back to default ringtone if the stored ID is invalid/stale.
 */
function getSelectedRingtoneFilename(): string {
	const defaultFilename = getRingtoneFilename(DEFAULT_RINGTONE_ID);

	try {
		const rawValue = store.get("ringtone-storage");

		// zustand persist stores as JSON string, parse it
		let parsed: PersistedRingtoneState | undefined;
		if (typeof rawValue === "string") {
			parsed = JSON.parse(rawValue) as PersistedRingtoneState;
		} else if (rawValue && typeof rawValue === "object") {
			// In case electron-store auto-parsed it
			parsed = rawValue as PersistedRingtoneState;
		}

		const selectedId = parsed?.state?.selectedRingtoneId ?? DEFAULT_RINGTONE_ID;

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

	const soundPath = getRingtonePath(filename);
	playSoundFile(soundPath);
}
