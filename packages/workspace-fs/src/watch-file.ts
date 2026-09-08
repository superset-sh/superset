import { type FSWatcher, watch } from "node:fs";
import { stat } from "node:fs/promises";
import type { FsWatchEvent } from "./types";

const DEBOUNCE_MS = 75;
const RECREATION_POLL_MS = 2_000;

export interface WatchSingleFileOptions {
	debounceMs?: number;
	/** Re-read consumers after attach to cover changes since their initial read. */
	emitInitialState?: boolean;
	/** How often to poll for the file to (re)appear while it's absent. */
	pollMs?: number;
}

export type ResourceWatchDisposer = (() => void) & { ready: Promise<void> };

/**
 * Targeted watch on one file, for paths the recursive workspace watcher
 * can't see (inside pruned subtrees like node_modules or gitignored build
 * dirs). Port of VS Code's per-resource fallback for visible editors
 * (editorService.ts `activeOutOfWorkspaceWatchers`).
 *
 * `node:fs.watch` on a file follows the inode, so after an atomic save
 * (write-temp + rename — most editors) the old watch is deaf. Every settled
 * event therefore re-installs the watch at the path. While the file is
 * absent the watch can't exist at all; a slow poll waits for recreation and
 * emits `create` when it lands.
 */
export function watchSingleFile(
	absolutePath: string,
	onEvent: (event: FsWatchEvent) => void,
	options: WatchSingleFileOptions = {},
): ResourceWatchDisposer {
	const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
	const pollMs = options.pollMs ?? RECREATION_POLL_MS;

	let disposed = false;
	let watcher: FSWatcher | null = null;
	let exists = false;
	/** Inode behind the current watch; a change means the watch is deaf. */
	let watchedIno: bigint | number | null = null;
	/** mtime last observed while the path is a directory (poll dedupe). */
	let dirMtimeMs: number | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let settling = false;
	let settleQueued = false;

	const emit = (kind: "create" | "update" | "delete", isDirectory: boolean) => {
		onEvent({ kind, absolutePath, isDirectory });
	};

	const closeWatcher = () => {
		watcher?.close();
		watcher = null;
		watchedIno = null;
	};

	const startPolling = () => {
		if (pollTimer || disposed) return;
		const timer = setInterval(() => void settle(), pollMs);
		timer.unref?.();
		pollTimer = timer;
	};

	const stopPolling = () => {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	};

	const installWatcher = (ino: bigint | number): boolean => {
		closeWatcher();
		try {
			const installed = watch(absolutePath, () => scheduleSettle());
			installed.on("error", () => {
				// A dead watch must not be mistaken for a live same-inode one.
				if (watcher === installed) closeWatcher();
				scheduleSettle();
			});
			watcher = installed;
			watchedIno = ino;
			return true;
		} catch {
			watcher = null;
			watchedIno = null;
			return false;
		}
	};

	const scheduleSettle = () => {
		if (disposed || debounceTimer) return;
		const timer = setTimeout(() => {
			debounceTimer = null;
			void settle();
		}, debounceMs);
		timer.unref?.();
		debounceTimer = timer;
	};

	/** Re-derive state from disk and emit the transition, if any. */
	const settle = async (): Promise<void> => {
		if (disposed) return;
		if (settling) {
			// An event landed mid-settle — its transition must not be lost.
			settleQueued = true;
			return;
		}
		settling = true;
		try {
			const stats = await stat(absolutePath).catch(() => null);
			if (disposed) return;
			if (stats) {
				const existed = exists;
				exists = true;
				if (stats.isDirectory()) {
					// macOS fs.watch on a directory never reports the directory's
					// own deletion (VS Code skips their folder-delete test on
					// darwin for this reason) — a watch here would go silently
					// deaf. Poll instead until the path is a plain file again.
					// Emit only on transition or mtime change; a poll tick with
					// nothing new must stay silent or consumers reload forever.
					closeWatcher();
					startPolling();
					if (!existed) {
						emit("create", true);
					} else if (dirMtimeMs === null || stats.mtimeMs !== dirMtimeMs) {
						// First observation as a dir (file→dir swap) or real change.
						emit("update", true);
					}
					dirMtimeMs = stats.mtimeMs;
					return;
				}
				dirMtimeMs = null;
				stopPolling();
				// Re-install only when the inode behind the path changed (atomic
				// save replaced it — the old watch follows the dead inode). A
				// same-inode close+reopen is not just wasted work: Bun's kqueue
				// teardown of the old watch races the new registration and can
				// leave the fresh watch deaf.
				if (!watcher || watchedIno !== stats.ino) {
					if (!installWatcher(stats.ino)) {
						startPolling();
					}
				}
				emit(existed ? "update" : "create", false);
			} else {
				const existed = exists;
				const wasDirectory = dirMtimeMs !== null;
				exists = false;
				dirMtimeMs = null;
				closeWatcher();
				startPolling();
				if (existed) {
					emit("delete", wasDirectory);
				}
			}
		} finally {
			settling = false;
			if (settleQueued) {
				settleQueued = false;
				scheduleSettle();
			}
		}
	};

	// Attach before an optional catch-up notification, so a caller whose
	// initial read raced this subscription can re-read without another gap.
	const ready = (async () => {
		const stats = await stat(absolutePath).catch(() => null);
		if (disposed) return;
		exists = stats !== null;
		if (stats?.isDirectory()) {
			dirMtimeMs = stats.mtimeMs;
			startPolling();
		} else if (!stats || !installWatcher(stats.ino)) {
			startPolling();
		}
		if (options.emitInitialState) {
			emit(stats ? "update" : "delete", stats?.isDirectory() ?? false);
		}
	})();

	return Object.assign(
		() => {
			disposed = true;
			if (debounceTimer) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			stopPolling();
			closeWatcher();
		},
		{ ready },
	);
}
