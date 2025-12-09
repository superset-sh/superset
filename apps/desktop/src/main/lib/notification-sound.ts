import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * Gets the path to the notification sound file.
 * In development, reads from src/resources. In production, reads from the bundled resources.
 */
function getNotificationSoundPath(): string {
	const isDev = !app.isPackaged;

	if (isDev) {
		return join(app.getAppPath(), "src/resources/sounds/notification.mp3");
	}

	return join(process.resourcesPath, "resources/sounds/notification.mp3");
}

/**
 * Plays the custom notification sound.
 * Uses platform-specific commands to play the audio file.
 */
export function playNotificationSound(): void {
	const soundPath = getNotificationSoundPath();

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
