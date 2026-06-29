import { settings } from "@superset/local-db";
import { localDb } from "./local-db";
import { menuEmitter } from "./menu-events";

/**
 * Reads whether notification sounds are muted. Defaults to `false` if the
 * setting is unset or the read fails.
 */
export function getNotificationSoundsMuted(): boolean {
	try {
		const settingsRow = localDb.select().from(settings).get();
		return settingsRow?.notificationSoundsMuted ?? false;
	} catch {
		return false;
	}
}

/**
 * Persists the notification-sounds muted state and notifies other surfaces
 * (menu bar checkbox, renderer queries) via `menuEmitter` so they re-sync.
 *
 * Throws if the write fails — callers that toggle optimistically should catch
 * and re-read the persisted value.
 */
export function setNotificationSoundsMuted(muted: boolean): void {
	localDb
		.insert(settings)
		.values({ id: 1, notificationSoundsMuted: muted })
		.onConflictDoUpdate({
			target: settings.id,
			set: { notificationSoundsMuted: muted },
		})
		.run();

	menuEmitter.emit("notifications-muted-changed", muted);
}
