import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * Gets the path to a ringtone sound file.
 *
 * Path resolution strategy:
 * - Production (packaged .app): app.asar.unpacked/resources/sounds/
 * - Development (NODE_ENV=development): src/resources/sounds/
 * - Preview (electron-vite preview): dist/resources/sounds/ (relative to __dirname)
 *
 * Sound files are unpacked from asar so external audio players (afplay, etc.) can access them.
 */
export function getSoundPath(filename: string): string {
	const dir = getSoundsDirectory();
	return join(dir, filename);
}

/**
 * Gets the directory containing ringtone sound files.
 *
 * In preview mode, uses __dirname (dist/main) to reliably resolve to dist/resources/sounds,
 * avoiding dependency on app.getAppPath() or process.cwd() which may vary.
 */
export function getSoundsDirectory(): string {
	if (app.isPackaged) {
		// Production: unpacked from asar for external audio players
		return join(process.resourcesPath, "app.asar.unpacked/resources/sounds");
	}

	const isDev = process.env.NODE_ENV === "development";

	if (isDev) {
		// Development: source files in project
		return join(app.getAppPath(), "src/resources/sounds");
	}

	// Preview mode: __dirname is dist/main, so go up one level to dist/resources/sounds
	// This is the most reliable path in preview since it's relative to the bundle location
	const previewPath = join(__dirname, "../resources/sounds");
	if (existsSync(previewPath)) {
		return previewPath;
	}

	// Fallback: try source directory (in case sounds weren't copied to dist)
	const srcPath = join(app.getAppPath(), "src/resources/sounds");
	if (existsSync(srcPath)) {
		console.warn(
			"[sound-paths] Using src/resources/sounds as fallback - sounds may not have been copied to dist",
		);
		return srcPath;
	}

	// Return the expected preview path even if missing (will fail gracefully in playback)
	console.warn(`[sound-paths] Sounds directory not found at: ${previewPath}`);
	return previewPath;
}
