import { existsSync, readdirSync } from "node:fs";
import { getSoundsDirectory } from "../../../../main/lib/sound-paths";
import { publicProcedure, router } from "../..";

/**
 * Ringtone router — lists available sound files.
 * Playback is handled in the renderer via HTMLAudioElement + setSinkId().
 */
export const createRingtoneRouter = () => {
	return router({
		/**
		 * Get the list of available ringtone files from the sounds directory
		 */
		list: publicProcedure.query(() => {
			const ringtonesDir = getSoundsDirectory();
			const files: string[] = [];

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
