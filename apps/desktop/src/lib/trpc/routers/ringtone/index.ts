import type { ChildProcess } from "node:child_process";
import { TRPCError } from "@trpc/server";
import type { BrowserWindow, OpenDialogOptions } from "electron";
import { dialog } from "electron";
import {
	getCustomRingtoneInfo,
	getCustomRingtonePath,
	importCustomRingtoneFromPath,
} from "main/lib/custom-ringtones";
import { playSoundFile } from "main/lib/play-sound";
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
 * Plays a sound file with session tracking for stop/race-condition safety.
 */
function playWithTracking(soundPath: string, volume: number = 100): void {
	stopCurrentSound();

	const sessionId = nextSessionId++;
	currentSession = { id: sessionId, process: null };

	const proc = playSoundFile(soundPath, volume, {
		onComplete: () => {
			if (currentSession?.id === sessionId) {
				currentSession = null;
			}
		},
		isCanceled: () => currentSession?.id !== sessionId,
		onProcessChange: (newProc) => {
			if (currentSession?.id === sessionId) {
				currentSession.process = newProc;
			}
		},
	});

	if (proc) {
		currentSession.process = proc;
	} else {
		currentSession = null;
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
			.input(
				z.object({
					ringtoneId: z.string(),
					volume: z.number().min(0).max(100).optional(),
				}),
			)
			.mutation(({ input }) => {
				const soundPath = getRingtoneSoundPath(input.ringtoneId);
				if (!soundPath) {
					return { success: true as const };
				}

				playWithTracking(soundPath, input.volume ?? 100);
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
