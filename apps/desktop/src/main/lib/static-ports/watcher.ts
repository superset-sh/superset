import { EventEmitter } from "node:events";
import { existsSync, type FSWatcher, statSync, watch } from "node:fs";
import { join } from "node:path";
import { PORTS_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";

/**
 * Watches for changes to ports.json files across workspaces.
 * Emits 'change' event with workspaceId when a watched file changes.
 */
class StaticPortsWatcher extends EventEmitter {
	private watchers = new Map<string, FSWatcher>();
	private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private lastMtimes = new Map<string, number>();

	/**
	 * Start watching ports.json for a workspace.
	 * If the file doesn't exist, we'll still set up the watch on the directory
	 * to detect when it's created.
	 */
	watch(workspaceId: string, worktreePath: string): void {
		// Clean up existing watcher for this workspace
		this.unwatch(workspaceId);

		const portsPath = join(
			worktreePath,
			PROJECT_SUPERSET_DIR_NAME,
			PORTS_FILE_NAME,
		);
		const supersetDir = join(worktreePath, PROJECT_SUPERSET_DIR_NAME);

		// Determine what to watch:
		// 1. If ports.json exists, watch it directly
		// 2. If .superset dir exists, watch it for ports.json creation
		// 3. If neither exists, watch the worktree root for .superset creation
		let watchPath: string;
		let watchingFor: "file" | "dir" | "root";

		if (existsSync(portsPath)) {
			watchPath = portsPath;
			watchingFor = "file";
			// Store initial mtime to detect actual changes
			try {
				const stat = statSync(portsPath);
				this.lastMtimes.set(workspaceId, stat.mtimeMs);
			} catch {
				// File may have been deleted between check and stat
			}
		} else if (existsSync(supersetDir)) {
			watchPath = supersetDir;
			watchingFor = "dir";
		} else if (existsSync(worktreePath)) {
			watchPath = worktreePath;
			watchingFor = "root";
		} else {
			return;
		}

		try {
			const watcher = watch(watchPath, (_eventType, filename) => {
				// Filter events based on what we're watching for
				if (watchingFor === "dir") {
					// Watching .superset dir - only care about ports.json
					if (filename && filename !== PORTS_FILE_NAME) {
						return;
					}
				} else if (watchingFor === "root") {
					// Watching worktree root - only care about .superset dir creation
					if (filename && filename !== PROJECT_SUPERSET_DIR_NAME) {
						return;
					}
					// .superset was created, switch to watching it
					if (existsSync(supersetDir)) {
						this.watch(workspaceId, worktreePath);
						return;
					}
				} else if (watchingFor === "file") {
					// Check if file actually changed by comparing mtime
					// This prevents spurious events from atime updates when reading the file
					try {
						if (!existsSync(portsPath)) {
							// File was deleted - clear mtime and emit change
							this.lastMtimes.delete(workspaceId);
						} else {
							const stat = statSync(portsPath);
							const lastMtime = this.lastMtimes.get(workspaceId);
							if (lastMtime !== undefined && stat.mtimeMs === lastMtime) {
								// mtime unchanged - this is a spurious event (e.g., atime update)
								return;
							}
							this.lastMtimes.set(workspaceId, stat.mtimeMs);
						}
					} catch {
						// Error getting stat - file may have been deleted, continue with emit
					}
				}

				// Debounce to avoid multiple rapid events
				const existingTimer = this.debounceTimers.get(workspaceId);
				if (existingTimer) {
					clearTimeout(existingTimer);
				}

				const timer = setTimeout(() => {
					this.debounceTimers.delete(workspaceId);
					this.emit("change", workspaceId);

					// If we were watching the directory and the file now exists,
					// switch to watching the file directly for more precise events
					if (watchingFor === "dir" && existsSync(portsPath)) {
						this.watch(workspaceId, worktreePath);
					}
				}, 100);

				this.debounceTimers.set(workspaceId, timer);
			});

			this.watchers.set(workspaceId, watcher);
		} catch (error) {
			console.error(
				`[StaticPortsWatcher] Failed to watch ${watchPath}:`,
				error,
			);
		}
	}

	/**
	 * Stop watching ports.json for a workspace.
	 */
	unwatch(workspaceId: string): void {
		const watcher = this.watchers.get(workspaceId);
		if (watcher) {
			watcher.close();
			this.watchers.delete(workspaceId);
		}

		const timer = this.debounceTimers.get(workspaceId);
		if (timer) {
			clearTimeout(timer);
			this.debounceTimers.delete(workspaceId);
		}

		this.lastMtimes.delete(workspaceId);
	}

	/**
	 * Stop all watchers.
	 */
	unwatchAll(): void {
		for (const workspaceId of this.watchers.keys()) {
			this.unwatch(workspaceId);
		}
	}
}

export const staticPortsWatcher = new StaticPortsWatcher();
