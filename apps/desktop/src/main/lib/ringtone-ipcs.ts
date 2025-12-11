import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { app, ipcMain } from "electron";

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

/**
 * Gets the directory containing ringtone files
 */
function getRingtonesDirectory(): string {
	const isDev = !app.isPackaged;

	if (isDev) {
		return join(app.getAppPath(), "src/resources/sounds");
	}
	return join(process.resourcesPath, "resources/sounds");
}

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
		currentSession.process = execFile(
			"powershell",
			["-c", `(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`],
			() => {
				if (currentSession?.id === sessionId) {
					currentSession = null;
				}
			},
		);
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
 * Register ringtone IPC handlers
 */
export function registerRingtoneHandlers() {
	ipcMain.handle(
		"ringtone:preview",
		async (_event, input: { filename: string }) => {
			try {
				// Handle "none" case - no sound
				if (!input.filename || input.filename === "") {
					return { success: true };
				}

				const soundPath = getRingtonePath(input.filename);
				playSoundFile(soundPath);
				return { success: true };
			} catch (error) {
				console.error("[ringtone:preview] Error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	ipcMain.handle("ringtone:stop", async () => {
		try {
			stopCurrentSound();
			return { success: true };
		} catch (error) {
			console.error("[ringtone:stop] Error:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	});

	ipcMain.handle("ringtone:list", async () => {
		try {
			const ringtonesDir = getRingtonesDirectory();
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

			return { success: true, data: files };
		} catch (error) {
			console.error("[ringtone:list] Error:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	});
}

/**
 * Plays the notification sound based on the selected ringtone
 * This is used by the notification system
 */
export function playNotificationRingtone(filename: string): void {
	if (!filename || filename === "") {
		return; // No sound for "none" option
	}

	const soundPath = getRingtonePath(filename);
	playSoundFile(soundPath);
}
