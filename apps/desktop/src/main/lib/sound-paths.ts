import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { env } from "main/env.main";

/**
 * Gets the path to a ringtone sound file.
 *
 * Path resolution strategy:
 * - Production (packaged .app): app.asar.unpacked/resources/public/sounds/
 * - Development (NODE_ENV=development): src/resources/public/sounds/
 * - Preview (electron-vite preview): dist/resources/public/sounds/ (relative to __dirname)
 *
 * Sound files live in the renderer's public directory so both the renderer
 * (via `/sounds/{filename}`) and the main process (via filesystem) can access them.
 */
export function getSoundPath(filename: string): string {
	const dir = getSoundsDirectory();
	return join(dir, filename);
}

/**
 * Gets the directory containing ringtone sound files.
 *
 * In preview mode, uses __dirname (dist/main) to reliably resolve to dist/resources/public/sounds,
 * avoiding dependency on app.getAppPath() or process.cwd() which may vary.
 */
export function getSoundsDirectory(): string {
	if (app.isPackaged) {
		return join(
			process.resourcesPath,
			"app.asar.unpacked/resources/public/sounds",
		);
	}

	const isDev = env.NODE_ENV === "development";

	if (isDev) {
		return join(app.getAppPath(), "src/resources/public/sounds");
	}

	// Preview mode: __dirname is dist/main, so go up one level
	const previewPath = join(__dirname, "../resources/public/sounds");
	if (existsSync(previewPath)) {
		return previewPath;
	}

	// Fallback: try source directory
	const srcPath = join(app.getAppPath(), "src/resources/public/sounds");
	if (existsSync(srcPath)) {
		console.warn(
			"[sound-paths] Using src/resources/public/sounds as fallback - sounds may not have been copied to dist",
		);
		return srcPath;
	}

	console.warn(`[sound-paths] Sounds directory not found at: ${previewPath}`);
	return previewPath;
}
