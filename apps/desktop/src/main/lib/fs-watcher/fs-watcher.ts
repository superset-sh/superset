import { EventEmitter } from "node:events";
import path from "node:path";
import type { AsyncSubscription, Event } from "@parcel/watcher";
import type {
	FileSystemBatchEvent,
	FileSystemChangeEvent,
} from "shared/file-tree-types";

const DEBOUNCE_MS = 100;
const MAX_BATCH_WINDOW_MS = 2000;

const IGNORE_DIRS = [
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	".turbo",
	"coverage",
];

interface WorkspaceWatcherState {
	subscription: AsyncSubscription;
	rootPath: string;
	pendingEvents: Map<string, FileSystemChangeEvent>;
	debounceTimer: ReturnType<typeof setTimeout> | null;
	maxWindowTimer: ReturnType<typeof setTimeout> | null;
}

function mapEventType(type: Event["type"]): FileSystemChangeEvent["type"] {
	switch (type) {
		case "create":
			return "add";
		case "update":
			return "change";
		case "delete":
			return "unlink";
		default:
			return "change";
	}
}

class FsWatcher extends EventEmitter {
	private watchers = new Map<string, WorkspaceWatcherState>();

	/**
	 * Start watching a workspace directory.
	 *
	 * Called from:
	 * - workspace-init.ts (on workspace ready)
	 * - main/index.ts (on app boot for existing workspaces)
	 *
	 * Paired with unwatch() in procedures/delete.ts (on workspace delete/close).
	 */
	async watch({
		workspaceId,
		rootPath,
	}: {
		workspaceId: string;
		rootPath: string;
	}): Promise<void> {
		// Clean up existing watcher for this workspace
		await this.unwatch(workspaceId);

		// Dynamic import to avoid issues with native module bundling
		const watcher = await import("@parcel/watcher");

		const subscription = await watcher.subscribe(
			rootPath,
			(err, events) => {
				if (err) {
					console.error(
						`[fs-watcher] Error for workspace ${workspaceId}:`,
						err,
					);
					return;
				}

				this.handleEvents(workspaceId, rootPath, events);
			},
			{
				ignore: IGNORE_DIRS,
			},
		);

		this.watchers.set(workspaceId, {
			subscription,
			rootPath,
			pendingEvents: new Map(),
			debounceTimer: null,
			maxWindowTimer: null,
		});

		console.log(
			`[fs-watcher] Watching workspace ${workspaceId} at ${rootPath}`,
		);
	}

	async unwatch(workspaceId: string): Promise<void> {
		const state = this.watchers.get(workspaceId);
		if (!state) return;

		if (state.debounceTimer) {
			clearTimeout(state.debounceTimer);
		}
		if (state.maxWindowTimer) {
			clearTimeout(state.maxWindowTimer);
		}

		await state.subscription.unsubscribe();
		this.watchers.delete(workspaceId);

		console.log(`[fs-watcher] Stopped watching workspace ${workspaceId}`);
	}

	async unwatchAll(): Promise<void> {
		const ids = [...this.watchers.keys()];
		await Promise.all(ids.map((id) => this.unwatch(id)));
	}

	getRootPath(workspaceId: string): string | undefined {
		return this.watchers.get(workspaceId)?.rootPath;
	}

	private handleEvents(
		workspaceId: string,
		rootPath: string,
		events: Event[],
	): void {
		const state = this.watchers.get(workspaceId);
		if (!state) return;

		for (const event of events) {
			const relativePath = path.relative(rootPath, event.path);
			const changeEvent: FileSystemChangeEvent = {
				type: mapEventType(event.type),
				path: event.path,
				relativePath,
			};
			// Last write wins for dedup (keyed by path)
			state.pendingEvents.set(event.path, changeEvent);
		}

		// Reset debounce timer
		if (state.debounceTimer) {
			clearTimeout(state.debounceTimer);
		}

		state.debounceTimer = setTimeout(() => {
			this.flush(workspaceId);
		}, DEBOUNCE_MS);

		// Start max-window timer on first event in a batch
		if (!state.maxWindowTimer) {
			state.maxWindowTimer = setTimeout(() => {
				this.flush(workspaceId);
			}, MAX_BATCH_WINDOW_MS);
		}
	}

	private flush(workspaceId: string): void {
		const state = this.watchers.get(workspaceId);
		if (!state || state.pendingEvents.size === 0) return;

		if (state.debounceTimer) {
			clearTimeout(state.debounceTimer);
			state.debounceTimer = null;
		}
		if (state.maxWindowTimer) {
			clearTimeout(state.maxWindowTimer);
			state.maxWindowTimer = null;
		}

		const batch: FileSystemBatchEvent = {
			workspaceId,
			events: [...state.pendingEvents.values()],
			timestamp: Date.now(),
		};

		state.pendingEvents.clear();
		this.emit("batch", batch);
	}
}

export const fsWatcher = new FsWatcher();
