import { execFile } from "node:child_process";
import { type FSWatcher, watch } from "node:fs";
import { promisify } from "node:util";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";

const execFileAsync = promisify(execFile);

const RESCAN_INTERVAL_MS = 30_000;
const DEBOUNCE_MS = 300;

export type GitChangedListener = (workspaceId: string) => void;

interface WatchedWorkspace {
	workspaceId: string;
	worktreePath: string;
	gitDir: string;
	watcher: FSWatcher;
	disposeWorktreeWatch: () => void;
}

/**
 * Watches git state for all workspaces in the host-service DB and emits a
 * coalesced `changed` signal when anything that could affect `git status`
 * output happens. Auto-discovers new workspaces and drops removed ones every
 * 30s.
 *
 * Two sources feed into the same debounced emit per workspace:
 *
 * 1. `.git/` directory (via `node:fs.watch`) — catches commits, staging,
 *    branch switches, fetches — anything that writes git metadata, including
 *    operations from an external terminal.
 * 2. Worktree root (via `@superset/workspace-fs` watcher manager) — catches
 *    working-tree file edits that change `git status` output. The underlying
 *    watcher honors `DEFAULT_IGNORE_PATTERNS`, which excludes `.git/`,
 *    `node_modules/`, `dist/`, etc. — exactly the paths that don't affect
 *    `git status`, so we don't waste refetches on them. Subscription is
 *    multiplexed by `FsWatcherManager` per absolute path, so this shares the
 *    underlying native watcher with any client-owned `fs:watch` subscriptions.
 *
 * Consumers therefore only need to subscribe to `git:changed` for refetch
 * purposes — no separate client-side debounce over `fs:events`.
 */
export class GitWatcher {
	private readonly db: HostDb;
	private readonly filesystem: WorkspaceFilesystemManager;
	private readonly listeners = new Set<GitChangedListener>();
	private readonly watched = new Map<string, WatchedWorkspace>();
	private readonly debounceTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private rescanTimer: ReturnType<typeof setInterval> | null = null;
	private closed = false;

	constructor(db: HostDb, filesystem: WorkspaceFilesystemManager) {
		this.db = db;
		this.filesystem = filesystem;
	}

	start(): void {
		void this.rescan();
		this.rescanTimer = setInterval(
			() => void this.rescan(),
			RESCAN_INTERVAL_MS,
		);
	}

	onChanged(listener: GitChangedListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	close(): void {
		this.closed = true;
		if (this.rescanTimer) {
			clearInterval(this.rescanTimer);
			this.rescanTimer = null;
		}
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
		for (const entry of this.watched.values()) {
			entry.watcher.close();
			entry.disposeWorktreeWatch();
		}
		this.watched.clear();
	}

	private debouncedEmit(workspaceId: string): void {
		const existing = this.debounceTimers.get(workspaceId);
		if (existing) clearTimeout(existing);
		this.debounceTimers.set(
			workspaceId,
			setTimeout(() => {
				this.debounceTimers.delete(workspaceId);
				for (const listener of this.listeners) {
					listener(workspaceId);
				}
			}, DEBOUNCE_MS),
		);
	}

	private async rescan(): Promise<void> {
		if (this.closed) return;

		let rows: Array<{ id: string; worktreePath: string }>;
		try {
			rows = this.db
				.select({
					id: workspaces.id,
					worktreePath: workspaces.worktreePath,
				})
				.from(workspaces)
				.all();
		} catch {
			return;
		}

		const currentIds = new Set(rows.map((r) => r.id));

		// Remove watchers for workspaces that no longer exist
		for (const [id, entry] of this.watched) {
			if (!currentIds.has(id)) {
				entry.watcher.close();
				entry.disposeWorktreeWatch();
				this.watched.delete(id);
			}
		}

		// Add watchers for new workspaces
		for (const row of rows) {
			if (this.watched.has(row.id)) continue;
			await this.watchWorkspace(row.id, row.worktreePath);
		}
	}

	private async watchWorkspace(
		workspaceId: string,
		worktreePath: string,
	): Promise<void> {
		if (this.closed) return;

		let gitDir: string;
		try {
			const { stdout } = await execFileAsync(
				"git",
				["rev-parse", "--git-dir"],
				{ cwd: worktreePath },
			);
			gitDir = stdout.trim();
			// If relative, resolve against worktree path
			if (!gitDir.startsWith("/")) {
				gitDir = `${worktreePath}/${gitDir}`;
			}
		} catch {
			// Not a git repo or path doesn't exist — skip
			return;
		}

		if (this.closed || this.watched.has(workspaceId)) return;

		// Start the worktree watch first so we have a dispose handle to capture
		// in the .git watcher's error handler closure. This avoids a race where
		// the error handler could fire before `this.watched.set(...)` runs.
		const disposeWorktreeWatch = this.startWorktreeWatch(
			workspaceId,
			worktreePath,
		);

		let watcher: FSWatcher;
		try {
			watcher = watch(gitDir, { recursive: true }, () => {
				this.debouncedEmit(workspaceId);
			});
		} catch {
			// fs.watch failed (e.g. directory doesn't exist)
			disposeWorktreeWatch();
			return;
		}

		watcher.on("error", () => {
			// Watcher died — clean up so rescan can re-add
			disposeWorktreeWatch();
			this.watched.delete(workspaceId);
			watcher.close();
		});

		this.watched.set(workspaceId, {
			workspaceId,
			worktreePath,
			gitDir,
			watcher,
			disposeWorktreeWatch,
		});
	}

	/**
	 * Subscribe to worktree fs events via the shared workspace-fs watcher
	 * manager. Each batch of events feeds into the existing `debouncedEmit`,
	 * so bursts of file edits collapse into a single `git:changed` per
	 * workspace per debounce window.
	 */
	private startWorktreeWatch(
		workspaceId: string,
		worktreePath: string,
	): () => void {
		let disposed = false;
		let iterator: AsyncIterator<unknown> | null = null;

		try {
			const service = this.filesystem.getServiceForWorkspace(workspaceId);
			const stream = service.watchPath({
				absolutePath: worktreePath,
				recursive: true,
			});
			iterator = stream[Symbol.asyncIterator]();
		} catch (error) {
			console.error("[git-watcher] failed to start worktree watch:", {
				workspaceId,
				error,
			});
			return () => {};
		}

		void (async () => {
			try {
				while (!disposed && iterator) {
					const next = await iterator.next();
					if (disposed || next.done) return;
					// Any batch of events may have touched paths that affect
					// `git status` output. Let the debounced emit coalesce bursts.
					this.debouncedEmit(workspaceId);
				}
			} catch (error) {
				if (!disposed) {
					console.error("[git-watcher] worktree watch stream failed:", {
						workspaceId,
						error,
					});
				}
			}
		})();

		return () => {
			disposed = true;
			void iterator?.return?.().catch(() => {});
			iterator = null;
		};
	}
}
