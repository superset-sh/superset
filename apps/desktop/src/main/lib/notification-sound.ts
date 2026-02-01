import { settings } from "@superset/local-db";
import { NOTIFICATION_EVENTS } from "shared/constants";
import {
	DEFAULT_RINGTONE_ID,
	getRingtoneFilename,
} from "../../shared/ringtones";
import { localDb } from "./local-db";
import { notificationsEmitter } from "./notifications/server";

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
 * Emits a PLAY_SOUND event so the renderer can play the notification sound
 * through the user's selected audio output device.
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

	notificationsEmitter.emit(NOTIFICATION_EVENTS.PLAY_SOUND, { filename });
}
