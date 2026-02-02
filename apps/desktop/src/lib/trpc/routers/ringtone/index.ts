import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow } from "electron";
import { z } from "zod";
import {
	getSoundPath,
	getSoundsDirectory,
} from "../../../../main/lib/sound-paths";
import { publicProcedure, router } from "../..";

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

function sendRingtoneEvent(
	channel: "ringtone-play" | "ringtone-stop",
	filename?: string,
): boolean {
	const window = BrowserWindow.getAllWindows().find(
		(browserWindow) => !browserWindow.isDestroyed(),
	);
	if (!window) {
		return false;
	}
	window.webContents.send(channel, filename);
	return true;
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

/**
 * Track current playing session to handle race conditions.
 * Each play operation gets a unique session ID. When stop is called,
 * the session is invalidated so any pending fallback processes won't start.
 */
let currentSession: {
	id: number;
	process: ChildProcess | null;
} | null = null;
let nextSessionId = 0;

/**
 * Stops the currently playing sound and invalidates the session
 */
function stopCurrentSound(): void {
	if (currentSession) {
		if (currentSession.process) {
			// Use SIGKILL for immediate termination (afplay doesn't always respond to SIGTERM)
			currentSession.process.kill("SIGKILL");
		}
		currentSession = null;
	}
}

/**
 * Plays a sound file using platform-specific commands.
 * Uses session tracking to prevent race conditions with fallback audio players.
 */
function playSoundFile(soundPath: string): void {
	if (!existsSync(soundPath)) {
		console.warn(`[ringtone] Sound file not found: ${soundPath}`);
		return;
	}

	// Stop any currently playing sound first
	stopCurrentSound();

	// Create a new session for this play operation
	const sessionId = nextSessionId++;
	currentSession = { id: sessionId, process: null };

	if (process.platform === "darwin") {
		currentSession.process = execFile("afplay", [soundPath], () => {
			// Only clear if this session is still active
			if (currentSession?.id === sessionId) {
				currentSession = null;
			}
		});
	} else if (process.platform === "win32") {
		const powershellPath = getWindowsPowerShellPath();
		currentSession.process = execFile(
			powershellPath,
			buildWindowsPlayerArgs(soundPath),
			{ windowsHide: true },
			() => {
				if (currentSession?.id === sessionId) {
					currentSession = null;
				}
			},
		);
		currentSession.process.on("error", (error) => {
			console.warn("[ringtone] Windows playback failed:", error.message);
		});
	} else {
		// Linux - try common audio players with race-safe fallback
		currentSession.process = execFile("paplay", [soundPath], (error) => {
			// Check if this session is still active before proceeding
			if (currentSession?.id !== sessionId) {
				return; // Session was stopped, don't start fallback
			}

			if (error) {
				// paplay failed, try aplay as fallback
				currentSession.process = execFile("aplay", [soundPath], () => {
					if (currentSession?.id === sessionId) {
						currentSession = null;
					}
				});
			} else {
				currentSession = null;
			}
		});
	}
}

/**
 * Ringtone router for audio preview and playback operations
 */
export const createRingtoneRouter = () => {
	return router({
		/**
		 * Preview a ringtone sound by filename
		 */
	preview: publicProcedure
		.input(z.object({ filename: z.string() }))
		.mutation(({ input }) => {
			// Handle "none" case - no sound
			if (!input.filename || input.filename === "") {
				return { success: true as const };
			}

			if (process.platform === "win32") {
				sendRingtoneEvent("ringtone-play", input.filename);
				return { success: true as const };
			}

			const soundPath = getSoundPath(input.filename);
			playSoundFile(soundPath);
			return { success: true as const };
		}),

		/**
		 * Stop the currently playing ringtone preview
		 */
	stop: publicProcedure.mutation(() => {
		if (process.platform === "win32") {
			sendRingtoneEvent("ringtone-stop");
		} else {
			stopCurrentSound();
		}
		return { success: true as const };
	}),

		/**
		 * Get the list of available ringtone files from the sounds directory
		 */
		list: publicProcedure.query(() => {
			const ringtonesDir = getSoundsDirectory();
			const files: string[] = [];

			// Add ringtones from the sounds directory if it exists
			if (existsSync(ringtonesDir)) {
				const dirFiles = readdirSync(ringtonesDir).filter(
					(file) =>
						file.endsWith(".mp3") ||
						file.endsWith(".wav") ||
						file.endsWith(".ogg"),
				);
				files.push(...dirFiles);
			}

			return files;
		}),
	});
};

/**
 * Plays the notification sound based on the selected ringtone.
 * This is used by the notification system.
 */
export function playNotificationRingtone(filename: string): void {
	if (!filename || filename === "") {
		return; // No sound for "none" option
	}

	if (process.platform === "win32") {
		sendRingtoneEvent("ringtone-play", filename);
		return;
	}

	const soundPath = getSoundPath(filename);
	playSoundFile(soundPath);
}
