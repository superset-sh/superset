import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { screenshots } from "@superset/local-db";
import { desc, eq } from "drizzle-orm";
import { app, shell } from "electron";
import { localDb } from "../local-db";

const MAX_LISTED_SCREENSHOTS = 200;
const THUMBNAIL_WIDTH = 200;

function screenshotsDir(): string {
	const dir = join(app.getPath("pictures"), "Superset Screenshots");
	mkdirSync(dir, { recursive: true });
	return dir;
}

/** Chrome-style timestamped filename, e.g. "Screenshot 2026-08-26 at 14.05.32.png". */
function timestampedFilename(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `Screenshot ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} at ${pad(
		now.getHours(),
	)}.${pad(now.getMinutes())}.${pad(now.getSeconds())}.png`;
}

/**
 * Persists page captures taken from the browser pane's overflow menu — the
 * capture itself (and its clipboard copy) stays in BrowserManager; this is
 * just where a capture ends up once someone wants to see it again.
 */
class ScreenshotManager extends EventEmitter {
	save(image: Electron.NativeImage, url: string) {
		const filename = timestampedFilename();
		const savePath = join(screenshotsDir(), filename);
		const pngBuffer = image.toPNG();
		writeFileSync(savePath, pngBuffer);

		const { width, height } = image.getSize();
		// A downscaled copy stored alongside the row means the gallery can
		// render a grid of real previews without reading every file on disk.
		const thumbnail = image.resize({ width: THUMBNAIL_WIDTH }).toDataURL();
		const id = randomUUID();

		localDb
			.insert(screenshots)
			.values({
				id,
				url,
				filename,
				savePath,
				width,
				height,
				thumbnail,
				capturedAt: Date.now(),
			})
			.run();
		this.emit("changed");

		return { id, savePath, base64: pngBuffer.toString("base64") };
	}

	list() {
		return localDb
			.select()
			.from(screenshots)
			.orderBy(desc(screenshots.capturedAt))
			.limit(MAX_LISTED_SCREENSHOTS)
			.all();
	}

	getById(id: string) {
		return localDb
			.select()
			.from(screenshots)
			.where(eq(screenshots.id, id))
			.get();
	}

	/** Clears tracked rows; the PNGs stay on disk, same as clearing a downloads list. */
	clear(): void {
		localDb.delete(screenshots).run();
		this.emit("changed");
	}

	showInFolder(savePath: string): void {
		shell.showItemInFolder(savePath);
	}

	openFile(savePath: string): Promise<string> {
		return shell.openPath(savePath);
	}
}

export const screenshotManager = new ScreenshotManager();
