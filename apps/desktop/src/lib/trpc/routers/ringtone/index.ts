import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import type { BrowserWindow, OpenDialogOptions } from "electron";
import { dialog } from "electron";
import {
	getCustomRingtoneInfo,
	getCustomRingtonePath,
	importCustomRingtoneFromPath,
} from "main/lib/custom-ringtones";
import { getSoundPath } from "main/lib/sound-paths";
import {
	CUSTOM_RINGTONE_ID,
	getRingtoneFilename,
	isBuiltInRingtoneId,
} from "shared/ringtones";
import { z } from "zod";
import { publicProcedure, router } from "../..";

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

function getRingtoneSoundPath(ringtoneId: string): string | null {
	if (!ringtoneId || ringtoneId === "") {
		return null;
	}

	if (ringtoneId === CUSTOM_RINGTONE_ID) {
		return getCustomRingtonePath();
	}

	if (!isBuiltInRingtoneId(ringtoneId)) {
		return null;
	}

	const filename = getRingtoneFilename(ringtoneId);
	if (!filename) {
		return null;
	}

	return getSoundPath(filename);
}

/**
 * Ringtone router for audio preview and playback operations
 */
export const createRingtoneRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		/**
		 * Preview a ringtone by ringtone ID.
		 */
		preview: publicProcedure
			.input(z.object({ ringtoneId: z.string() }))
			.mutation(({ input }) => {
				const soundPath = getRingtoneSoundPath(input.ringtoneId);
				if (!soundPath) {
					return { success: true as const };
				}

				playSoundFile(soundPath);
				return { success: true as const };
			}),

		/**
		 * Stop the currently playing ringtone preview
		 */
		stop: publicProcedure.mutation(() => {
			stopCurrentSound();
			return { success: true as const };
		}),

		/**
		 * Returns metadata for the imported custom ringtone, if one exists.
		 */
		getCustom: publicProcedure.query(() => {
			return getCustomRingtoneInfo();
		}),

		/**
		 * Imports a custom ringtone file from disk and stores it in the Superset home assets directory.
		 */
		importCustom: publicProcedure.mutation(async () => {
			const window = getWindow();
			const openDialogOptions: OpenDialogOptions = {
				properties: ["openFile"],
				title: "Select Notification Sound",
				filters: [
					{
						name: "Audio",
						extensions: ["mp3", "wav", "ogg"],
					},
				],
			};
			const result = window
				? await dialog.showOpenDialog(window, openDialogOptions)
				: await dialog.showOpenDialog(openDialogOptions);

			if (result.canceled || result.filePaths.length === 0) {
				return { canceled: true as const, ringtone: null };
			}

			try {
				const ringtone = await importCustomRingtoneFromPath(
					result.filePaths[0],
				);
				return { canceled: false as const, ringtone };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Failed to import custom ringtone",
				});
			}
		}),
	});
};

/**
 * Plays the notification sound based on the selected ringtone.
 * This is used by the notification system.
 */
export function playNotificationRingtone(ringtoneId: string): void {
	const soundPath = getRingtoneSoundPath(ringtoneId);
	if (!soundPath) {
		return;
	}

	playSoundFile(soundPath);
}
