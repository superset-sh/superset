import { execFile } from "node:child_process";
import { existsSync, type FSWatcher, watch } from "node:fs";
import { promisify } from "node:util";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import { and, eq, isNull } from "drizzle-orm";
import type { HostDb } from "../db/index.ts";
import { workspaces } from "../db/schema.ts";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem/index.ts";
import { listGitIgnoredDirs } from "../runtime/git/index.ts";

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

/** Above this, clients are better served by one broad diff-cache invalidation
 * than hundreds of per-path invalidations. The null sentinel also lets the
 * watcher skip path normalization for the rest of the debounce window. */
export const MAX_WORKTREE_PATHS_PER_BATCH = 128;

/**
 * Min interval between per-workspace gitignored-dir refreshes. Refreshes ride
 * on emitted `git:changed` events, so churn that is entirely filtered spawns
 * no git processes at all; this only bounds the cost of a busy-but-legit
 * workspace.
 */
const IGNORED_DIRS_REFRESH_MIN_MS = 5_000;

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

/**
 * Normalize one native worktree event batch while bounding unique path growth.
 * Duplicate notifications must not consume the cap: a later distinct path still
 * needs to be emitted unless the batch crosses into broad invalidation.
 */
export function collectWorktreeBatchPaths(
	events: readonly FsWatchEvent[],
	worktreePath: string,
): Set<string> {
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

	const relativePaths = new Set<string>();
	for (const event of events) {
		const relativePath = toRelative(event.absolutePath);
		if (relativePath) relativePaths.add(relativePath);
		if (event.oldAbsolutePath) {
			const oldRelativePath = toRelative(event.oldAbsolutePath);
			if (oldRelativePath) relativePaths.add(oldRelativePath);
		}
		if (relativePaths.size > MAX_WORKTREE_PATHS_PER_BATCH) break;
	}
	return relativePaths;
}

/** Whether `relative` is (or is inside) one of the ignored directories. */
function isUnderIgnoredDir(
	relative: string,
	ignoredDirs: ReadonlySet<string>,
): boolean {
	if (ignoredDirs.size === 0) return false;
	let slash = relative.indexOf("/");
	while (slash !== -1) {
		if (ignoredDirs.has(relative.slice(0, slash))) return true;
		slash = relative.indexOf("/", slash + 1);
	}
	return ignoredDirs.has(relative);
}

export interface FilterGitIgnoredEventsResult {
	events: FsWatchEvent[];
	/**
	 * A `.gitignore` file changed somewhere in the batch: the ignored set may
	 * no longer be valid and must be dropped until the next refresh.
	 */
	sawGitignoreChange: boolean;
}

/**
 * Drop events whose every path sits inside a directory git ignores entirely —
 * build-output churn (`.next`, `__pycache__`, …) that can't change `git
 * status`, so it must not trigger the status-refresh cascade or eat into the
 * MAX_WORKTREE_PATHS_PER_BATCH budget. The set holds worktree-relative dir
 * paths from `listGitIgnoredDirs`, which only reports fully-untracked
 * subtrees, so a tracked file's event can never be dropped. Renames are kept
 * unless both endpoints are ignored. Fails open: paths outside the worktree
 * or an empty set filter nothing.
 */
export function filterGitIgnoredEvents(
	events: readonly FsWatchEvent[],
	worktreePath: string,
	ignoredDirs: ReadonlySet<string>,
): FilterGitIgnoredEventsResult {
	const worktreePrefix = worktreePath.endsWith("/")
		? worktreePath
		: `${worktreePath}/`;
	let sawGitignoreChange = false;
	const kept: FsWatchEvent[] = [];

	const isIgnored = (absolutePath: string | undefined): boolean => {
		if (!absolutePath || !absolutePath.startsWith(worktreePrefix)) return false;
		const relative = absolutePath.slice(worktreePrefix.length);
		if (relative === ".gitignore" || relative.endsWith("/.gitignore")) {
			sawGitignoreChange = true;
			return false;
		}
		return isUnderIgnoredDir(relative, ignoredDirs);
	};

	for (const event of events) {
		const newIgnored = isIgnored(event.absolutePath);
		const oldIgnored = event.oldAbsolutePath
			? isIgnored(event.oldAbsolutePath)
			: true;
		if (newIgnored && oldIgnored) continue;
		kept.push(event);
	}
	return { events: kept, sawGitignoreChange };
}

export interface GitChangedEvent {
	workspaceId: string;
	/**
	 * Worktree-relative paths that changed when the batch was worktree-only.
	 * Absent when the batch included `.git/*` activity or exceeded the bounded
	 * worktree path list, signaling a broad state change.
	 */
	paths?: string[];
}

export type GitChangedListener = (event: GitChangedEvent) => void;

interface PendingBatch {
	/** Any `.git/*` event seen during this debounce window. */
	hasGitDir: boolean;
	/** Worktree-relative paths, or null once the batch requires broad refresh. */
	paths: Set<string> | null;
}

interface WatchedWorkspace {
	workspaceId: string;
	worktreePath: string;
	gitDir: string;
	watcher: FSWatcher;
	disposeWorktreeWatch: () => void;
}

interface IgnoredDirsState {
	/** Worktree-relative fully-gitignored dirs; events under them are dropped. */
	dirs: ReadonlySet<string>;
	refreshing: boolean;
	lastRefreshAt: number;
	/**
	 * An ignore-rule source changed (.gitignore, .git/info/exclude) since the
	 * last refresh: the next refresh must also check whether the native
	 * watcher's attach-time prune went stale (a dir was UN-ignored).
	 */
	rulesChanged: boolean;
}

/**
 * Watches git state for workspaces someone is actually interested in — not
 * every workspace in the host-service DB (see #6729). Membership is
 * refcounted via `watchWorkspace`/`unwatchWorkspace`: a workspace is watched
 * exactly while its interest count is positive, driven by client `git:watch`
 * subscriptions (routed through `EventBus`) or an internal host-service
 * caller. A 30s sweep cleans up watchers for workspaces that got archived or
 * deleted, and retries attaching for any still-interested workspace that
 * failed to attach earlier (worktree not ready yet) — both proportional to
 * the interested set, not the full workspace table.
 *
 * Emits a coalesced `changed` signal when anything that could affect `git
 * status` output happens. Two sources feed into the same debounced emit per
 * workspace:
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
 *    `git status`, so we don't waste refetches on them. Events that survive
 *    the static list but sit inside a *gitignored* dir (repo-specific build
 *    output the list can't know about, or a dir created after the native
 *    watcher attached) are dropped by `filterGitIgnoredEvents` against a
 *    per-workspace set from `listGitIgnoredDirs`, refreshed after each emit
 *    and failed open whenever a `.gitignore` changes. Subscription is
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
	/** Refcount of active interest per workspace; watched iff count > 0. */
	private readonly interest = new Map<string, number>();
	private readonly debounceTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private readonly pendingBatches = new Map<string, PendingBatch>();
	private readonly ignoredDirs = new Map<string, IgnoredDirsState>();
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

	/**
	 * Register interest in a workspace's git state. The first caller for a
	 * workspace triggers attaching real watchers (a DB lookup + `.git/` +
	 * worktree-root watch); subsequent callers just bump the refcount.
	 */
	watchWorkspace(workspaceId: string): void {
		if (this.closed) return;
		const count = this.interest.get(workspaceId) ?? 0;
		this.interest.set(workspaceId, count + 1);
		if (count === 0 && !this.watched.has(workspaceId)) {
			void this.attachFromDb(workspaceId);
		}
	}

	/**
	 * Release interest in a workspace. Tears down its watchers once the
	 * refcount reaches zero.
	 */
	unwatchWorkspace(workspaceId: string): void {
		const count = this.interest.get(workspaceId) ?? 0;
		if (count <= 1) {
			this.interest.delete(workspaceId);
			this.stopWatching(workspaceId);
		} else {
			this.interest.set(workspaceId, count - 1);
		}
	}

	private async attachFromDb(workspaceId: string): Promise<void> {
		if (this.closed) return;
		let row: { worktreePath: string } | undefined;
		try {
			row = this.db
				.select({ worktreePath: workspaces.worktreePath })
				.from(workspaces)
				.where(
					and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)),
				)
				.get();
		} catch (error) {
			console.error("[git-watcher] attach lookup failed", {
				workspaceId,
				error,
			});
			return;
		}
		// Not found / archived: nothing to attach right now. If the row appears
		// later (e.g. `watchWorkspace` raced workspace creation), the 30s sweep
		// retries any still-interested workspace that never attached.
		if (!row) return;
		await this.attachWatcher(workspaceId, row.worktreePath);
	}

	private stopWatching(workspaceId: string): void {
		const entry = this.watched.get(workspaceId);
		if (entry) {
			entry.watcher.close();
			entry.disposeWorktreeWatch();
			this.watched.delete(workspaceId);
		}
		this.ignoredDirs.delete(workspaceId);
		const timer = this.debounceTimers.get(workspaceId);
		if (timer) {
			clearTimeout(timer);
			this.debounceTimers.delete(workspaceId);
		}
		this.pendingBatches.delete(workspaceId);
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
		this.ignoredDirs.clear();
		this.interest.clear();
	}

	private getOrCreateIgnoredDirsState(workspaceId: string): IgnoredDirsState {
		let state = this.ignoredDirs.get(workspaceId);
		if (!state) {
			state = {
				dirs: new Set(),
				refreshing: false,
				lastRefreshAt: 0,
				rulesChanged: false,
			};
			this.ignoredDirs.set(workspaceId, state);
		}
		return state;
	}

	/**
	 * Re-ask git which dirs are fully ignored. Rides on emitted `git:changed`
	 * events (plus one call at watch start), so filtered-out churn never spawns
	 * git; `force` bypasses the min-interval for the initial load.
	 */
	private refreshIgnoredDirs(
		workspaceId: string,
		worktreePath: string,
		force = false,
	): void {
		// The async continuations below must only act for the watcher that
		// started them: unwatchWorkspace() (or unwatch-then-rewatch) mid-refresh
		// would otherwise re-create ignore state and, on a swap, schedule a
		// git:changed for a workspace nobody watches any more.
		const entry = this.watched.get(workspaceId);
		if (!entry) return;
		const stillCurrent = () =>
			!this.closed && this.watched.get(workspaceId) === entry;
		const state = this.getOrCreateIgnoredDirsState(workspaceId);
		if (state.refreshing) return;
		if (
			!force &&
			Date.now() - state.lastRefreshAt < IGNORED_DIRS_REFRESH_MIN_MS
		)
			return;
		state.refreshing = true;
		const rulesChanged = state.rulesChanged;
		state.rulesChanged = false;
		void listGitIgnoredDirs(worktreePath)
			.then(async (dirs) => {
				if (!stillCurrent()) return;
				state.dirs = new Set(dirs);
				state.lastRefreshAt = Date.now();
				if (rulesChanged) {
					// Ignore rules changed: a dir may have been UN-ignored, leaving
					// the native watcher's attach-time prune stale (events for that
					// dir silently suppressed until restart). refreshIgnores
					// re-derives the set and swaps the subscription only when it
					// actually shrank; after a swap, force one broad status refresh
					// to cover anything written during the swap gap.
					const swapped = await this.filesystem
						.refreshWatcherIgnores(workspaceId)
						.catch((error) => {
							console.error("[git-watcher] watcher ignore refresh failed", {
								workspaceId,
								error,
							});
							return false;
						});
					if (!stillCurrent()) return;
					if (swapped) this.markGitDirDirty(workspaceId);
				}
			})
			.catch((error) => {
				console.error("[git-watcher] ignored-dir refresh failed", {
					workspaceId,
					error,
				});
			})
			.finally(() => {
				state.refreshing = false;
				// Rules changed again while this refresh ran (e.g. a branch
				// switch rewriting .gitignore twice): the listing we just stored
				// is stale and the emit that flagged it was swallowed by the
				// `refreshing` guard — run once more.
				if (state.rulesChanged && stillCurrent()) {
					this.refreshIgnoredDirs(workspaceId, worktreePath, true);
				}
			});
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
		// `.git/info/exclude` is an ignore-rule source just like .gitignore;
		// an edit there can also un-ignore a natively-pruned dir.
		if (filename?.replace(/\\/g, "/") === "info/exclude") {
			this.getOrCreateIgnoredDirsState(workspaceId).rulesChanged = true;
		}
		this.markGitDirDirty(workspaceId);
	}

	private markGitDirDirty(workspaceId: string): void {
		this.getOrCreateBatch(workspaceId).hasGitDir = true;
		this.scheduleFlush(workspaceId);
	}

	private addWorktreePaths(workspaceId: string, paths: Iterable<string>): void {
		const batch = this.getOrCreateBatch(workspaceId);
		if (batch.paths) {
			for (const path of paths) {
				if (!path) continue;
				batch.paths.add(path);
				if (batch.paths.size > MAX_WORKTREE_PATHS_PER_BATCH) {
					batch.paths = null;
					break;
				}
			}
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
		const gitDirOnly =
			batch.hasGitDir && batch.paths !== null && batch.paths.size === 0;
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
					batch.hasGitDir || batch.paths === null || batch.paths.size === 0
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
				// Anything that emits may also have changed what git ignores (a
				// build dir appearing, a .gitignore edit) — re-derive the filter
				// set so the follow-up churn stops emitting.
				const watchedEntry = this.watched.get(workspaceId);
				if (watchedEntry) {
					this.refreshIgnoredDirs(workspaceId, watchedEntry.worktreePath);
				}
			}, delay),
		);
	}

	/**
	 * Cleanup + retry sweep — NOT a re-registration pass. Drops watchers (and
	 * interest) for workspaces that got archived or deleted, and retries
	 * attaching for any workspace someone is still interested in but that
	 * never attached (worktree wasn't ready, transient git-dir lookup
	 * failure). Both loops are bounded by the interested set, not the total
	 * non-archived workspace count — see #6729. (The `select` below still
	 * scans every non-archived row every 30s to detect archival/deletion —
	 * one indexed, synchronous SQLite query, not the expensive part: no
	 * subprocess spawns or live fs.watch handles come from it directly.)
	 */
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
				.where(isNull(workspaces.archivedAt))
				.all();
		} catch {
			return;
		}

		const existingIds = new Set(rows.map((r) => r.id));
		const worktreePathById = new Map(rows.map((r) => [r.id, r.worktreePath]));

		// Remove watchers for workspaces that no longer exist (archived or
		// deleted). Routed through stopWatching() (not inlined) so a pending
		// debounce timer/batch for the removed workspace can't fire a stale
		// git:changed later — it also clears those, this loop used to leave
		// them dangling.
		//
		// Deliberately does NOT touch `interest` here. A workspace can be
		// transiently absent from this scan without any client ever losing
		// interest in it (e.g. archived-then-restored via the tombstone
		// delete flow) — a client that already sent one `git:watch` has no
		// reason to send it again, and won't unless it remounts or the
		// socket reconnects. Deleting `interest` for a merely-transient gap
		// would desync GitWatcher's bookkeeping from what the client (and
		// its socket's `gitSubscriptions`) still believes is watched, with
		// nothing left to ever resync it — the retry loop below only walks
		// `interest.keys()`, so a wrongly-cleared entry can never come back
		// on its own. `interest` is owned exclusively by
		// watchWorkspace()/unwatchWorkspace(); a stale entry for a
		// workspace gone for good costs one Map entry (bounded by the
		// per-client `git:watch` cap in event-bus.ts) until the holding
		// client unwatches or its socket closes — self-healing, unlike a
		// leaked live watcher.
		for (const id of [...this.watched.keys()]) {
			if (!existingIds.has(id)) this.stopWatching(id);
		}

		// Retry attaching for still-interested workspaces that never attached.
		for (const id of this.interest.keys()) {
			if (this.watched.has(id)) continue;
			const worktreePath = worktreePathById.get(id);
			if (!worktreePath) continue;
			await this.attachWatcher(id, worktreePath);
		}
	}

	private async attachWatcher(
		workspaceId: string,
		worktreePath: string,
	): Promise<void> {
		if (this.closed) return;

		// Deleted-out-from-under worktree: skip the exec attempt; the 30s
		// rescan re-probes and picks the workspace up when the dir returns.
		if (!existsSync(worktreePath)) return;

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
			// Watcher died — clean up so rescan can re-add. Identity-checked: an
			// error queued on a watcher that unwatch→rewatch already replaced
			// must not evict the live entry (its resources were released by
			// stopWatching; closing again is harmless).
			watcher.close();
			if (this.watched.get(workspaceId)?.watcher !== watcher) return;
			disposeWorktreeWatch();
			this.watched.delete(workspaceId);
		});

		// Recheck interest: watchWorkspace()/unwatchWorkspace() can flip the
		// refcount to zero while the DB lookup + `git rev-parse` subprocess
		// above were in flight (fast tab close, effect re-run). Committing to
		// `watched` anyway would leak a live watcher forever — nothing but
		// archival/deletion would ever tear it down, reintroducing #6729 one
		// race at a time. Don't commit what's no longer wanted.
		if (
			this.closed ||
			this.watched.has(workspaceId) ||
			!this.interest.has(workspaceId)
		) {
			disposeWorktreeWatch();
			watcher.close();
			return;
		}

		this.watched.set(workspaceId, {
			workspaceId,
			worktreePath,
			gitDir,
			watcher,
			disposeWorktreeWatch,
		});
		this.refreshIgnoredDirs(workspaceId, worktreePath, true);

		// A change can land in the gap between watchWorkspace() and this line
		// (the DB lookup + `git rev-parse` above are async) and go unobserved —
		// fs.watch only reports events from here forward. One coalesced
		// catch-up emit closes that window; consumers already treat every
		// git:changed as "re-check status", so a possibly-redundant emit costs
		// one extra read, not incorrect state.
		this.markGitDirDirty(workspaceId);
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

					const ignoredState = this.getOrCreateIgnoredDirsState(workspaceId);
					const filtered = filterGitIgnoredEvents(
						next.value.events,
						worktreePath,
						ignoredState.dirs,
					);
					if (filtered.sawGitignoreChange) {
						// Rules changed — stop filtering (fail open) until the
						// post-emit refresh re-derives the set, and have that
						// refresh check the native prune for staleness.
						ignoredState.dirs = new Set();
						ignoredState.rulesChanged = true;
					}
					// Entirely gitignored churn (a build writing into .next):
					// no flush at all — this is the whole point of the filter.
					if (filtered.events.length === 0) continue;

					if (this.pendingBatches.get(workspaceId)?.paths === null) {
						this.scheduleFlush(workspaceId);
						continue;
					}

					const relativePaths = collectWorktreeBatchPaths(
						filtered.events,
						worktreePath,
					);

					if (relativePaths.size > 0) {
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
