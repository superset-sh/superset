import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { settings } from "@superset/local-db";
import { BrowserWindow } from "electron";
import {
	DEFAULT_RINGTONE_ID,
	getRingtoneFilename,
} from "../../shared/ringtones";
import { localDb } from "./local-db";
import { getSoundPath } from "./sound-paths";

function getWindowsPowerShellPath(): string {
	const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
	const powershellPath = join(
		systemRoot,
		"System32",
		"WindowsPowerShell",
		"v1.0",
		"powershell.exe",
	);
	return existsSync(powershellPath) ? powershellPath : "powershell.exe";
}

function buildWindowsPlayerArgs(soundPath: string): string[] {
	const escapedPath = soundPath.replace(/'/g, "''");
	const script = [
		"$ErrorActionPreference = 'Stop'",
		"try {",
		"$player = New-Object -ComObject WMPlayer.OCX.7",
		`$player.URL = '${escapedPath}'`,
		"$player.controls.play()",
		"$started = $false",
		"for ($i = 0; $i -lt 300; $i++) {",
		"  if ($player.playState -eq 3) { $started = $true }",
		"  if ($started -and ($player.playState -eq 1 -or $player.playState -eq 8)) { break }",
		"  Start-Sleep -Milliseconds 200",
		"}",
		"} catch {",
		"  try {",
		"    Add-Type -AssemblyName PresentationCore",
		"    $media = New-Object System.Windows.Media.MediaPlayer",
		`    $media.Open([System.Uri]::new('${escapedPath}'))`,
		"    $media.Volume = 1.0",
		"    $media.Play()",
		"    Start-Sleep -Milliseconds 200",
		"    while ($media.NaturalDuration.HasTimeSpan -and $media.Position -lt $media.NaturalDuration.TimeSpan) {",
		"      Start-Sleep -Milliseconds 200",
		"    }",
		"    $media.Close()",
		"  } catch {",
		"    exit 1",
		"  }",
		"}",
	].join("; ");

	return [
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		script,
	];
}

function sendRingtoneEvent(filename: string): boolean {
	const window = BrowserWindow.getAllWindows().find(
		(browserWindow) => !browserWindow.isDestroyed(),
	);
	if (!window) {
		return false;
	}
	window.webContents.send("ringtone-play", filename);
	return true;
}

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
		const powershellPath = getWindowsPowerShellPath();
		execFile(
			powershellPath,
			buildWindowsPlayerArgs(soundPath),
			{ windowsHide: true },
			(error) => {
				if (error) {
					console.warn(
						"[notification-sound] Windows playback failed:",
						error.message,
					);
				}
			},
		);
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

	if (process.platform === "win32" && sendRingtoneEvent(filename)) {
		return;
	}

	const soundPath = getSoundPath(filename);
	playSoundFile(soundPath);
}
