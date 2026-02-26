import { settings } from "@superset/local-db";
import { localDb } from "./local-db";

/**
 * Returns whether notification sounds should be muted.
 * This is used to configure native Electron notification sound behavior via `silent`.
 */
export function areNotificationSoundsMuted(): boolean {
	try {
		const settingsRow = localDb.select().from(settings).get();
		return settingsRow?.notificationSoundsMuted ?? false;
	} catch {
		return false;
	}
}
