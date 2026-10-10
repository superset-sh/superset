import { type FSWatcher, type Stats, watch } from "node:fs";
import { lstat, opendir } from "node:fs/promises";
import path from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createIgnoreMatcher } from "./ignore-matcher";
import type {
	NativeWatchBackend,
	NativeWatchEvent,
	NativeWatchRequest,
	NativeWatchSubscription,
} from "./types";

type EntryKind = "file" | "dir";

interface DirectoryRecord {
	dev: number;
	ino: number;
	watcher: FSWatcher;
	children: Map<string, EntryKind>;
}

const ABSENT = new Set(["ENOENT", "ENOTDIR"]);
const SKIPPED = new Set([...ABSENT, "EACCES", "EPERM"]);

function isSkipped(error: unknown): boolean {
	return SKIPPED.has((error as NodeJS.ErrnoException | null)?.code ?? "");
}

function isAbsent(error: unknown): boolean {
	return ABSENT.has((error as NodeJS.ErrnoException | null)?.code ?? "");
}

/**
 * One inotify watch per directory: a directory's watch already reports
 * writes, attribute changes, creates, deletes and renames of its children,
 * so files never get a watch of their own. Callbacks only queue the path they
 * name; one queue reconciles each path against `lstat` and the recorded
 * children, which is also how create is told apart from update.
 *
 * Writes made through a hard link outside the watched tree are not seen.
 */
class DirectoryWatch implements NativeWatchSubscription {
	private readonly directories = new Map<string, DirectoryRecord>();
	private readonly queue = new Set<string>();
	/** Directories whose own watch reported an event about the directory itself. */
	private readonly reopen = new Set<string>();
	private readonly isIgnored: ReturnType<typeof createIgnoreMatcher>;
	private pendingEvents: NativeWatchEvent[] = [];
	private draining = false;
	private attachError: unknown;
	private attached = false;
	private closed = false;

	constructor(private readonly request: NativeWatchRequest) {
		this.isIgnored = createIgnoreMatcher(request.rootPath, request.ignore);
	}

	async attach(): Promise<void> {
		const { rootPath, signal } = this.request;
		signal?.throwIfAborted();
		const onAbort = () => void this.unsubscribe();
		signal?.addEventListener("abort", onAbort, { once: true });
		try {
			await this.addDirectory(rootPath, false);
			// Settle what changed during the crawl; a steady stream of later
			// changes must not hold up the attach, so those drain afterwards.
			await this.drain(this.queue.size);
			signal?.throwIfAborted();
			if (this.attachError !== undefined) throw this.attachError;
			if (this.closed) throw new Error("Watch closed during attach");
			if (!this.directories.has(rootPath)) {
				throw new Error(`Cannot watch path: ${rootPath}`);
			}
			this.attached = true;
			if (this.queue.size > 0) void this.drainInBackground();
		} catch (error) {
			await this.unsubscribe();
			throw error;
		} finally {
			signal?.removeEventListener("abort", onAbort);
		}
	}

	async unsubscribe(): Promise<void> {
		this.closed = true;
		this.queue.clear();
		this.reopen.clear();
		this.pendingEvents = [];
		for (const record of this.directories.values()) record.watcher.close();
		this.directories.clear();
	}

	/** Losing coverage fails an attach; once attached it is only reported. */
	private fail(error: unknown): void {
		if (!this.attached) throw error;
		this.request.onError(error);
	}

	private emit(type: NativeWatchEvent["type"], target: string): void {
		this.pendingEvents.push({ type, path: target });
	}

	private flush(): void {
		if (this.closed || this.pendingEvents.length === 0) return;
		const events = this.pendingEvents;
		this.pendingEvents = [];
		this.request.onEvents(events);
	}

	private enqueue(target: string): void {
		if (this.closed) return;
		this.queue.add(target);
		if (this.attached && !this.draining) void this.drainInBackground();
	}

	private async drainInBackground(): Promise<void> {
		this.draining = true;
		try {
			await this.drain();
		} catch (error) {
			this.request.onError(error);
		} finally {
			this.draining = false;
		}
		if (!this.closed && this.queue.size > 0) void this.drainInBackground();
	}

	private async drain(limit = Number.POSITIVE_INFINITY): Promise<void> {
		// Let the rest of the inotify read batch join the queue first.
		await nextTurn();
		for (let n = 0; n < limit && !this.closed && this.queue.size > 0; n++) {
			const target = this.queue.values().next().value as string;
			this.queue.delete(target);
			await this.reconcile(target);
			this.flush();
		}
	}

	private watchDirectory(directory: string): FSWatcher {
		const watcher: FSWatcher = watch(directory, (type, filename) => {
			if (this.directories.get(directory)?.watcher !== watcher) return;
			// libuv names an event on the watched directory itself after its
			// basename, which a child can share; treat it as both. Only a
			// `rename` (deleted, moved, or watch removed) can end the watch.
			const name = filename?.toString();
			if (name !== undefined) this.enqueue(path.join(directory, name));
			if (
				name === undefined ||
				(type === "rename" && name === path.basename(directory))
			) {
				this.reopen.add(directory);
				this.enqueue(directory);
			}
		});
		watcher.on("error", (error) => {
			if (this.directories.get(directory)?.watcher !== watcher) return;
			if (this.attached) this.request.onError(error);
			else this.attachError ??= error;
			this.removeDirectory(directory, true);
			this.enqueue(directory);
		});
		return watcher;
	}

	/** The directory's included entries, or undefined if it cannot be listed. */
	private async list(
		directory: string,
	): Promise<Map<string, EntryKind> | undefined> {
		const entries = new Map<string, EntryKind>();
		try {
			for await (const entry of await opendir(directory)) {
				if (this.closed) return;
				const child = path.join(directory, entry.name);
				let kind: EntryKind = entry.isDirectory() ? "dir" : "file";
				if (
					!entry.isDirectory() &&
					!entry.isFile() &&
					!entry.isSymbolicLink()
				) {
					try {
						kind = (await lstat(child)).isDirectory() ? "dir" : "file";
					} catch (error) {
						if (isSkipped(error)) continue;
						throw error;
					}
				}
				if (!this.isIgnored(child, kind === "dir"))
					entries.set(entry.name, kind);
			}
		} catch (error) {
			if (!isSkipped(error)) this.fail(error);
			return;
		}
		return entries;
	}

	/**
	 * Watches `directory` before listing it, so a change made while it is
	 * listed reaches the queue and is reconciled afterwards.
	 */
	private async addDirectory(directory: string, emit: boolean): Promise<void> {
		if (this.closed || this.directories.has(directory)) return;
		let stats: Stats;
		try {
			stats = await lstat(directory);
		} catch (error) {
			if (!isSkipped(error)) this.fail(error);
			return;
		}
		if (
			this.closed ||
			this.directories.has(directory) ||
			!stats.isDirectory()
		) {
			return;
		}
		let watcher: FSWatcher;
		try {
			watcher = this.watchDirectory(directory);
		} catch (error) {
			if (!isSkipped(error)) this.fail(error);
			return;
		}
		const record: DirectoryRecord = {
			dev: stats.dev,
			ino: stats.ino,
			watcher,
			children: new Map(),
		};
		this.directories.set(directory, record);

		const entries = await this.list(directory);
		if (!entries || this.directories.get(directory) !== record) return;
		for (const [name, kind] of entries) {
			record.children.set(name, kind);
			if (emit) this.emit("create", path.join(directory, name));
		}
		for (const [name, kind] of entries) {
			if (kind !== "dir") continue;
			if (this.directories.get(directory) !== record) return;
			await this.addDirectory(path.join(directory, name), emit);
		}
	}

	/** Forgets `directory` and everything recorded below it. */
	private removeDirectory(directory: string, emit: boolean): void {
		const record = this.directories.get(directory);
		if (!record) return;
		this.directories.delete(directory);
		this.reopen.delete(directory);
		record.watcher.close();
		for (const [name, kind] of record.children) {
			const child = path.join(directory, name);
			if (kind === "dir") this.removeDirectory(child, emit);
			if (emit) this.emit("delete", child);
		}
	}

	/**
	 * Replaces a directory's watch, which an event about the directory itself
	 * may have ended, and queues every entry that changed meanwhile.
	 */
	private async rewatch(
		directory: string,
		record: DirectoryRecord,
	): Promise<void> {
		let watcher: FSWatcher;
		try {
			watcher = this.watchDirectory(directory);
		} catch (error) {
			if (!isAbsent(error)) this.request.onError(error);
			return;
		}
		record.watcher.close();
		record.watcher = watcher;
		const entries = await this.list(directory);
		if (!entries || this.directories.get(directory) !== record) return;
		for (const [name, kind] of record.children) {
			if (entries.get(name) !== kind) this.enqueue(path.join(directory, name));
		}
		for (const name of entries.keys()) {
			if (!record.children.has(name)) this.enqueue(path.join(directory, name));
		}
	}

	private async reconcile(target: string): Promise<void> {
		const rewatch = this.reopen.delete(target);
		const isRoot = target === this.request.rootPath;
		const parentPath = path.dirname(target);
		const parent = isRoot ? undefined : this.directories.get(parentPath);
		if (!isRoot && !parent) return;

		let stats: Stats | undefined;
		try {
			stats = await lstat(target);
		} catch (error) {
			if (!isAbsent(error)) {
				this.request.onError(error);
				return;
			}
		}
		if (this.closed) return;
		if (!isRoot && this.directories.get(parentPath) !== parent) return;

		let kind: EntryKind | undefined =
			stats === undefined ? undefined : stats.isDirectory() ? "dir" : "file";
		if (kind && !isRoot && this.isIgnored(target, kind === "dir")) {
			kind = undefined;
		}
		const record = this.directories.get(target);
		if (
			record &&
			stats &&
			kind === "dir" &&
			record.dev === stats.dev &&
			record.ino === stats.ino
		) {
			if (rewatch) await this.rewatch(target, record);
			return;
		}

		if (isRoot) {
			this.removeDirectory(target, kind !== undefined);
			if (kind === "dir") await this.addDirectory(target, true);
			else this.emit("delete", target);
			return;
		}
		if (!parent) return;

		const name = path.basename(target);
		const known = parent.children.get(name);
		if (known === "file" && kind === "file") {
			this.emit("update", target);
			return;
		}
		if (known !== undefined) {
			if (known === "dir") this.removeDirectory(target, true);
			parent.children.delete(name);
			this.emit("delete", target);
		}
		if (kind === undefined) return;
		parent.children.set(name, kind);
		this.emit("create", target);
		if (kind === "dir") await this.addDirectory(target, true);
	}
}

export const directoryWatchBackend: NativeWatchBackend = {
	name: "directory",
	async subscribe(request) {
		const subscription = new DirectoryWatch(request);
		await subscription.attach();
		return subscription;
	},
};
