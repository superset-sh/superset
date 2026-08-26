import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { downloads } from "@superset/local-db";
import { desc, eq, ne } from "drizzle-orm";
import { app, session, shell } from "electron";
import { localDb } from "../local-db";

/** The partition the in-app browser pane (and app renderer) use. */
const BROWSER_PARTITION = "persist:superset";
const MAX_TRACKED_DOWNLOADS = 200;

/** Chrome-style dedupe: "report.pdf" -> "report (1).pdf" -> "report (2).pdf". */
function resolveSavePath(dir: string, filename: string): string {
	const ext = extname(filename);
	const base = basename(filename, ext);
	let candidate = join(dir, filename);
	for (let n = 1; existsSync(candidate); n++) {
		candidate = join(dir, `${base} (${n})${ext}`);
	}
	return candidate;
}

/**
 * Tracks downloads started from the in-app browser pane's session. A single
 * `will-download` listener on the shared partition covers every pane (and
 * window) using it, matching a normal browser's one global downloads list.
 */
class DownloadManager extends EventEmitter {
	private activeItems = new Map<string, Electron.DownloadItem>();
	private started = false;

	start(): void {
		if (this.started) return;
		this.started = true;

		// A row left "progressing" from a previous run has no live DownloadItem
		// to resume — the app doesn't persist partial-download state across
		// restarts, so it can only ever be reported as interrupted.
		localDb
			.update(downloads)
			.set({ state: "interrupted" })
			.where(eq(downloads.state, "progressing"))
			.run();

		const ses = session.fromPartition(BROWSER_PARTITION);
		const downloadDir = app.getPath("downloads");
		ses.setDownloadPath(downloadDir);

		ses.on("will-download", (_event, item) => {
			const id = randomUUID();
			const savePath = resolveSavePath(downloadDir, item.getFilename());
			item.setSavePath(savePath);

			localDb
				.insert(downloads)
				.values({
					id,
					url: item.getURL(),
					filename: basename(savePath),
					savePath,
					mimeType: item.getMimeType() || null,
					totalBytes: item.getTotalBytes() || null,
					receivedBytes: 0,
					state: "progressing",
					startedAt: Date.now(),
				})
				.run();
			this.activeItems.set(id, item);
			this.emit("changed");

			item.on("updated", (_e, state) => {
				localDb
					.update(downloads)
					.set({
						receivedBytes: item.getReceivedBytes(),
						totalBytes: item.getTotalBytes() || null,
						state: state === "progressing" ? "progressing" : "interrupted",
					})
					.where(eq(downloads.id, id))
					.run();
				this.emit("changed");
			});

			item.once("done", (_e, state) => {
				this.activeItems.delete(id);
				localDb
					.update(downloads)
					.set({
						state,
						receivedBytes: item.getReceivedBytes(),
						completedAt: Date.now(),
					})
					.where(eq(downloads.id, id))
					.run();
				this.emit("changed");
			});
		});
	}

	list() {
		return localDb
			.select()
			.from(downloads)
			.orderBy(desc(downloads.startedAt))
			.limit(MAX_TRACKED_DOWNLOADS)
			.all();
	}

	getById(id: string) {
		return localDb.select().from(downloads).where(eq(downloads.id, id)).get();
	}

	/** True if a live in-progress download was found and cancelled. */
	cancel(id: string): boolean {
		const item = this.activeItems.get(id);
		if (!item) return false;
		item.cancel();
		return true;
	}

	/** Clears finished entries; downloads still in flight are left alone. */
	clear(): void {
		localDb.delete(downloads).where(ne(downloads.state, "progressing")).run();
		this.emit("changed");
	}

	showInFolder(savePath: string): void {
		shell.showItemInFolder(savePath);
	}

	openFile(savePath: string): Promise<string> {
		return shell.openPath(savePath);
	}
}

export const downloadManager = new DownloadManager();
