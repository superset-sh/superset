import { execFile } from "node:child_process";
import { type FSWatcher, watch } from "node:fs";
import { promisify } from "node:util";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import type { HostDb } from "../db/index.ts";
import { workspaces } from "../db/schema.ts";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem/index.ts";

const execFileAsync = promisify(execFile);

const RESCAN_INTERVAL_MS = 30_000;

/** Debounce window for batches with worktree edits — flush fast, latency matters. */
export const DEBOUNCE_MS = 300;

/**
 * Wider window for `.git/`-only batches: coalesces metadata bursts (commit, fetch
 * ref update, branch switch) that survive the path filter, trading ~1s of refresh
 * latency for fewer idle git subprocesses (#4198). Leading-anchored (see
 * `scheduleFlush`) so a rapid sequence can't starve the flush past this bound.
 */
export const GIT_DIR_DEBOUNCE_MS = 1_000;

/**
 * `.git/` top-level dirs whose churn never changes `git status`: `objects/**`
 * (fetch/gc/repack blobs — the bulk of idle churn), `lfs/**` (object cache),
 * `logs/**` (reflog). A real state change always touches refs/index/HEAD too.
 */
const IGNORED_GIT_DIR_TOP_LEVELS = new Set(["objects", "lfs", "logs"]);

/**
 * `.git/` files whose churn never changes `git status`: `FETCH_HEAD`, rewritten
 * by every fetch (status-affecting ref updates land in `refs/`/`packed-refs`).
 */
const IGNORED_GIT_DIR_FILES = new Set(["FETCH_HEAD"]);

/**
 * Whether a `.git/`-relative path could affect `git status`. Fails open on a
 * null/empty filename so a real change is never dropped.
 */
export function isStatusRelevantGitDirEvent(
	filename: string | null | undefined,
): boolean {
	if (filename == null) return true;
	const normalized = filename.replace(/\\/g, "/");
	if (normalized === "") return true;
	if (IGNORED_GIT_DIR_FILES.has(normalized)) return false;
	const firstSlash = normalized.indexOf("/");
	const topLevel =
		firstSlash === -1 ? normalized : normalized.slice(0, firstSlash);
	return !IGNORED_GIT_DIR_TOP_LEVELS.has(topLevel);
}

export interface GitChangedEvent {
	workspaceId: string;
	/**
	 * Worktree-relative paths that changed when the batch was worktree-only.
	 * Absent when the batch included any `.git/*` activity, signaling a broad
	 * state change (commit, staging, branch switch, fetch, etc.).
	 */
	paths?: string[];
}

export type GitChangedListener = (event: GitChangedEvent) => void;

interface PendingBatch {
	/** Any `.git/*` event seen during this debounce window. */
	hasGitDir: boolean;
	/** Worktree-relative paths accumulated during this debounce window. */
	paths: Set<string>;
}

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
 *    branch switches, fetches, including from an external terminal. Paths that
 *    can't change `git status` (`objects/**`, `lfs/**`, `logs/**`, `FETCH_HEAD`)
 *    are filtered via `isStatusRelevantGitDirEvent`; `.git/`-only batches use
 *    the wider `GIT_DIR_DEBOUNCE_MS` window.
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
	private readonly pendingBatches = new Map<string, PendingBatch>();
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
		this.pendingBatches.clear();
		for (const entry of this.watched.values()) {
			entry.watcher.close();
			entry.disposeWorktreeWatch();
		}
		this.watched.clear();
	}

	private getOrCreateBatch(workspaceId: string): PendingBatch {
		let batch = this.pendingBatches.get(workspaceId);
		if (!batch) {
			batch = { hasGitDir: false, paths: new Set() };
			this.pendingBatches.set(workspaceId, batch);
		}
		return batch;
	}

	/**
	 * Handle a raw `.git/` watcher event, marking the workspace dirty only if it
	 * could affect `git status` (drops `objects/**` fetch/gc/pack churn).
	 */
	private handleGitDirEvent(
		workspaceId: string,
		filename: string | null,
	): void {
		if (!isStatusRelevantGitDirEvent(filename)) return;
		this.markGitDirDirty(workspaceId);
	}

	private markGitDirDirty(workspaceId: string): void {
		this.getOrCreateBatch(workspaceId).hasGitDir = true;
		this.scheduleFlush(workspaceId);
	}

	private addWorktreePaths(workspaceId: string, paths: Iterable<string>): void {
		const batch = this.getOrCreateBatch(workspaceId);
		for (const path of paths) {
			if (path) batch.paths.add(path);
		}
		this.scheduleFlush(workspaceId);
	}

	private scheduleFlush(workspaceId: string): void {
		const existing = this.debounceTimers.get(workspaceId);
		const batch = this.getOrCreateBatch(workspaceId);
		// `.git/`-only batches use the wide window, leading-anchored: the first
		// event arms it and later `.git/`-only events ride it rather than resetting,
		// so a rapid metadata sequence (rebase, `git am`) can't push the flush past
		// GIT_DIR_DEBOUNCE_MS. A worktree edit joining reverts to the short window.
		const gitDirOnly = batch.hasGitDir && batch.paths.size === 0;
		if (gitDirOnly && existing) return;
		if (existing) clearTimeout(existing);
		const delay = gitDirOnly ? GIT_DIR_DEBOUNCE_MS : DEBOUNCE_MS;
		this.debounceTimers.set(
			workspaceId,
			setTimeout(() => {
				this.debounceTimers.delete(workspaceId);
				const batch = this.pendingBatches.get(workspaceId);
				this.pendingBatches.delete(workspaceId);
				if (!batch) return;
				const event: GitChangedEvent =
					batch.hasGitDir || batch.paths.size === 0
						? { workspaceId }
						: { workspaceId, paths: [...batch.paths] };
				for (const listener of this.listeners) {
					// Isolate per-listener throws so one bad subscriber can't skip
					// siblings. Other escapes fall through to the process-level net.
					try {
						listener(event);
					} catch (error) {
						console.error("[git-watcher:listener] threw — contained", {
							error,
						});
					}
				}
			}, delay),
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
			watcher = watch(gitDir, { recursive: true }, (_event, filename) => {
				this.handleGitDirEvent(workspaceId, filename);
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
	 * manager. Each batch of events feeds into the debounced flush, contributing
	 * worktree-relative paths that get carried in the emitted `git:changed`
	 * event. Bursts collapse into a single event per workspace per debounce
	 * window.
	 */
	private startWorktreeWatch(
		workspaceId: string,
		worktreePath: string,
	): () => void {
		let disposed = false;
		let iterator: AsyncIterator<{ events: FsWatchEvent[] }> | null = null;

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

		const worktreePrefix = worktreePath.endsWith("/")
			? worktreePath
			: `${worktreePath}/`;

		const toRelative = (absolutePath: string): string | null => {
			if (absolutePath === worktreePath) return null;
			if (!absolutePath.startsWith(worktreePrefix)) return null;
			const relative = absolutePath.slice(worktreePrefix.length);
			// Defensive: ignore anything inside .git/ — the dedicated .git watcher
			// handles those and the worktree fs watcher's default ignore patterns
			// already exclude it, but a rare leak shouldn't pollute the paths list.
			if (relative === ".git" || relative.startsWith(".git/")) return null;
			return relative;
		};

		void (async () => {
			try {
				while (!disposed && iterator) {
					const next = await iterator.next();
					if (disposed || next.done) return;

					const relativePaths: string[] = [];
					for (const event of next.value.events) {
						const rel = toRelative(event.absolutePath);
						if (rel) relativePaths.push(rel);
						if (event.oldAbsolutePath) {
							const oldRel = toRelative(event.oldAbsolutePath);
							if (oldRel) relativePaths.push(oldRel);
						}
					}

					if (relativePaths.length > 0) {
						this.addWorktreePaths(workspaceId, relativePaths);
					} else {
						this.getOrCreateBatch(workspaceId);
						this.scheduleFlush(workspaceId);
					}
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
