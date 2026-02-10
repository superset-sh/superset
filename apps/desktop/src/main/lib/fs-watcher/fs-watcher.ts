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

interface WatcherState {
	workspaceId: string;
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
	private active: WatcherState | null = null;

	/**
	 * Switch to watching a different workspace directory.
	 * If already watching the same workspace, this is a no-op.
	 * Flushes + stops the old watcher before starting the new one.
	 *
	 * Called from:
	 * - setLastActiveWorkspace() in db-helpers.ts (on workspace switch)
	 * - workspace-init.ts (on workspace ready, if still active)
	 * - main/index.ts (on app boot for the active workspace)
	 */
	async switchTo({
		workspaceId,
		rootPath,
	}: {
		workspaceId: string;
		rootPath: string;
	}): Promise<void> {
		// No-op if already watching this workspace
		if (this.active?.workspaceId === workspaceId) {
			return;
		}

		// Stop old watcher (flush pending events first)
		await this.stop();

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

		this.active = {
			workspaceId,
			subscription,
			rootPath,
			pendingEvents: new Map(),
			debounceTimer: null,
			maxWindowTimer: null,
		};

		this.emit("switched", workspaceId);

		console.log(
			`[fs-watcher] Watching workspace ${workspaceId} at ${rootPath}`,
		);
	}

	/**
	 * Stop watching the active workspace if it matches the given ID.
	 * No-op if the given workspace is not the active one.
	 */
	async unwatch(workspaceId: string): Promise<void> {
		if (!this.active || this.active.workspaceId !== workspaceId) return;
		await this.stopInternal();
	}

	/**
	 * Stop the active watcher (flush pending events, unsubscribe, clear state).
	 */
	async stop(): Promise<void> {
		await this.stopInternal();
	}

	/**
	 * Get the root path for a workspace, only if it's the active one.
	 */
	getRootPath(workspaceId: string): string | undefined {
		if (this.active?.workspaceId === workspaceId) {
			return this.active.rootPath;
		}
		return undefined;
	}

	/**
	 * Get the currently active workspace ID.
	 */
	getActiveWorkspaceId(): string | undefined {
		return this.active?.workspaceId;
	}

	private async stopInternal(): Promise<void> {
		const state = this.active;
		if (!state) return;

		// Flush any pending events before stopping
		this.flush();

		if (state.debounceTimer) {
			clearTimeout(state.debounceTimer);
		}
		if (state.maxWindowTimer) {
			clearTimeout(state.maxWindowTimer);
		}

		await state.subscription.unsubscribe();
		this.active = null;

		console.log(
			`[fs-watcher] Stopped watching workspace ${state.workspaceId}`,
		);
	}

	private handleEvents(
		workspaceId: string,
		rootPath: string,
		events: Event[],
	): void {
		if (!this.active || this.active.workspaceId !== workspaceId) return;

		const state = this.active;

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
			this.flush();
		}, DEBOUNCE_MS);

		// Start max-window timer on first event in a batch
		if (!state.maxWindowTimer) {
			state.maxWindowTimer = setTimeout(() => {
				this.flush();
			}, MAX_BATCH_WINDOW_MS);
		}
	}

	private flush(): void {
		const state = this.active;
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
			workspaceId: state.workspaceId,
			events: [...state.pendingEvents.values()],
			timestamp: Date.now(),
		};

		state.pendingEvents.clear();
		this.emit("batch", batch);
	}
}

export const fsWatcher = new FsWatcher();
