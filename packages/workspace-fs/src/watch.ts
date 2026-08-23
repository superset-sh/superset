import { realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type AsyncSubscription,
	type Event as ParcelWatcherEvent,
	subscribe as subscribeToFilesystem,
} from "@parcel/watcher";
import { toErrorMessage } from "./error-message";
import { findNestedRepoRoots } from "./find-nested-repos";
import { normalizeAbsolutePath } from "./paths";
import {
	DEFAULT_IGNORE_DIR_NAMES,
	DEFAULT_IGNORE_PATTERNS,
	invalidateSearchIndexesForRoot,
	patchSearchIndexesForRoot,
	type SearchPatchEvent,
} from "./search";
import { ThrottledWorker } from "./throttled-worker";
import type { FsWatchEvent } from "./types";
import {
	coalesceWatchEvents,
	type InternalWatchEvent,
	reconcileRenameEvents,
} from "./watch-event-coalescing";

// Cap per-watcher file-path memory so a monotonic stream of unique paths
// (log rotation, hashed build artifacts) doesn't grow JS heap unbounded.
// Directories are tracked separately and uncapped — directory count per
// worktree is bounded by repo structure (O(100s) even for huge repos), and
// losing a directory hint causes a delete event to fall back to file-only
// search-index pruning, leaving stale descendant entries until the next
// full rebuild.
const FILE_PATHS_MAX = 10_000;

// Throttler bounds (mirror VS Code's parcelWatcher.ts:181-188 — same algorithm,
// same numbers). Bounds the rate at which events fan out to listeners so a
// legitimate burst (mass refactor, branch checkout) can't pin a CPU draining
// downstream consumers, and a runaway producer can't grow the JS heap unbounded.
const MAX_WORK_CHUNK_SIZE = 500;
const THROTTLE_DELAY_MS = 200;
const MAX_BUFFERED_EVENTS = 30_000;

// FSEvents overflow rescan pacing. Under sustained churn the kernel drops
// events repeatedly (648 overflows/day observed across 8 worktrees of one
// monorepo); reacting to each one cancels in-flight search-index rebuilds and
// re-triggers full disk walks. Instead: coalesce per watch root into at most
// one rescan per window, double the window while overflows keep arriving, and
// reset after a quiet period. The rescan timer always trails the last
// overflow, so settled state is guaranteed to be picked up.
const OVERFLOW_RESCAN_INITIAL_MS = 5_000;
const OVERFLOW_RESCAN_MAX_MS = 60_000;
const OVERFLOW_BACKOFF_RESET_MS = 120_000;

// Recovery liveness probe: a freshly attached FSEvents stream can be deaf for
// a sub-second window after subscribe() resolves (observed on a busy Electron
// main loop) — writes in that window are missed forever. Recovery writes a
// probe file and only announces the resumed root once its event arrives.
const PROBE_PREFIX = ".superset-watcher-probe-";
const PROBE_TIMEOUT_MS = 4_000;

// Backslash-escape every character picomatch (parcel's glob engine) treats as
// magic, so an absolute path is matched literally when embedded in a glob.
// Mirrors the metacharacter set `is-glob`/picomatch@2 recognize.
function escapeGlobMagic(input: string): string {
	return input.replace(/[\\*?{}()[\]!+@|^$]/g, (char) => `\\${char}`);
}

// Wall-clock budget for the nested-repo scan (bounds attach latency on a slow
// or network-backed FS, where readdir latency — not directory count — is the
// limiter). The static ignore globs still cover the known worktree conventions
// if the scan truncates here.
const NESTED_REPO_SCAN_DEADLINE_MS = 3_000;

/**
 * Whether a root-relative path falls under any pruned directory: a static
 * default (any path segment in DEFAULT_IGNORE_DIR_NAMES, plus the multi-
 * segment `.claude/worktrees` convention), or one of the per-root dynamic
 * prefixes (nested repos, gitignored dirs). Mirrors the semantics of the
 * ignore globs handed to parcel, minus file patterns (`*.tsbuildinfo`) —
 * over-reporting a file there as watched only costs a missed targeted watch
 * on a file type nobody opens.
 */
export function isRelPathUnderPrunedDirs(
	relative: string,
	prunedRelPrefixes: readonly string[],
): boolean {
	const segments = relative.split("/");
	for (let i = 0; i < segments.length - 1; i += 1) {
		const segment = segments[i] as string;
		if (DEFAULT_IGNORE_DIR_NAMES.has(segment)) {
			return true;
		}
		// `**/.claude/worktrees/**` is the one multi-segment static glob.
		if (segment === ".claude" && segments[i + 1] === "worktrees") {
			return true;
		}
	}
	for (const prefix of prunedRelPrefixes) {
		if (relative.startsWith(`${prefix}/`)) {
			return true;
		}
	}
	return false;
}

// Watches are always recursive — @parcel/watcher offers no shallow mode.
export interface WatchPathOptions {
	absolutePath: string;
}

type WatchListener = (batch: { events: FsWatchEvent[] }) => void;

interface WatcherState {
	/** Path as the caller asked us to watch, used in events emitted to listeners. */
	absolutePath: string;
	/**
	 * Resolved-symlink path actually handed to @parcel/watcher. Differs from
	 * `absolutePath` when the requested path includes a symlinked component;
	 * we map kernel-reported paths back to `absolutePath` form before emit.
	 * Mirrors VS Code's parcelWatcher.ts `realPath` handling (lines 488-516).
	 *
	 * `realPathNormalized` carries the same NFC normalization we apply to
	 * incoming event paths on darwin, so the path.relative rebase in
	 * normalizeEvents is length-stable across composed/decomposed forms.
	 */
	realPath: string;
	realPathNormalized: string;
	realPathDiffers: boolean;
	/** Null while suspended (root deleted, polling for recreation). */
	subscription: AsyncSubscription | null;
	recoveryTimer: ReturnType<typeof setInterval> | null;
	recovering: boolean;
	/**
	 * Bumped on every native attach/suspend; callbacks from a superseded
	 * stream compare against it and drop their events, so a stale batch can't
	 * re-suspend a stream that recovery just brought back.
	 */
	generation: number;
	/** Set by the parcel callback when it sees the recovery liveness probe. */
	probeSeen: boolean;
	/** Bounded post-overflow probe for a root deletion whose event was dropped. */
	overflowRootCheckTimer: ReturnType<typeof setInterval> | null;
	overflowRootChecksLeft: number;
	/** Pending coalesced overflow rescan; trails the last overflow of a storm. */
	overflowRescanTimer: ReturnType<typeof setTimeout> | null;
	/** Hard fire-by time for the pending batch — rearms clamp to this so
	 * sustained overflow can't postpone rescans past the cap. */
	overflowRescanDeadline: number;
	/** Delay for the next overflow rescan; doubles per rescan up to the cap. */
	overflowRescanDelayMs: number;
	/** Overflows absorbed by the pending rescan (fire-time log only). */
	overflowsCoalesced: number;
	lastOverflowAt: number;
	listeners: Set<WatchListener>;
	/**
	 * Root-relative directories pruned from the native subscription beyond the
	 * static defaults (nested repos + gitignored dirs), kept queryable so
	 * `isPathPruned` can tell callers "this path gets no events — install a
	 * targeted watch if you need it".
	 */
	prunedRelPrefixes: string[];
	filePaths: Map<string, true>;
	directoryPaths: Set<string>;
	pendingEvents: ParcelWatcherEvent[];
	flushTimer: ReturnType<typeof setTimeout> | null;
	/**
	 * Per-state throttler. VS Code (parcelWatcher.ts:181-188) uses a single
	 * shared throttler at the watcher class level; ours is per-state because
	 * each FsWatcherManager subscriber consumes events for its own watch root
	 * independently — sharing one buffer would let a noisy worktree starve
	 * a quiet one's listeners.
	 */
	throttler: ThrottledWorker<FsWatchEvent>;
}

// A dead FSEvents stream's unsubscribe can hang forever (observed after the
// watch root is deleted out from under it); never let it block teardown.
async function unsubscribeQuietly(
	subscription: AsyncSubscription | null,
): Promise<void> {
	if (!subscription) {
		return;
	}
	await Promise.race([
		subscription.unsubscribe().catch(() => {}),
		new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, 5_000);
			timer.unref?.();
		}),
	]);
}

function internalToFsWatchEvent(event: InternalWatchEvent): FsWatchEvent {
	return {
		kind: event.kind,
		absolutePath: event.absolutePath,
		oldAbsolutePath: event.oldAbsolutePath,
		isDirectory: event.isDirectory,
	};
}

function internalToSearchPatchEvent(
	event: InternalWatchEvent,
): SearchPatchEvent | null {
	if (event.kind === "overflow") {
		return null;
	}
	// The search index only ever holds files, so an undeterminable type is
	// worth no more than "not a directory" here. Treating it as a directory
	// instead would invalidate the whole index for every build temp file that
	// vanishes mid-batch.
	return {
		kind: event.kind,
		absolutePath: event.absolutePath,
		oldAbsolutePath: event.oldAbsolutePath,
		isDirectory: event.isDirectory ?? false,
	};
}

export interface FsWatcherManagerOptions {
	debounceMs?: number;
	ignore?: string[];
	/**
	 * Returns watch-root-relative directories that git ignores entirely
	 * (fully-untracked subtrees like `.next` or `__pycache__`), so they can be
	 * pruned from the native subscription alongside the static defaults.
	 * Injected (rather than spawning git here) to mirror how search injects
	 * `runRipgrep`. Best-effort: failures degrade to the static list.
	 */
	listGitIgnoredDirs?: (rootPath: string) => Promise<string[]>;
	/** Per-watcher LRU cap on tracked file paths. Test-only override. */
	filePathsMax?: number;
	/** How often a suspended watcher polls for its deleted root to reappear. */
	recoveryPollMs?: number;
	/** Overflow rescan pacing. Test-only overrides. */
	overflowRescanInitialMs?: number;
	overflowRescanMaxMs?: number;
	overflowBackoffResetMs?: number;
}

export class FsWatcherManager {
	private readonly debounceMs: number;
	private readonly ignore: string[];
	private readonly listGitIgnoredDirs?: (rootPath: string) => Promise<string[]>;
	private readonly filePathsMax: number;
	private readonly recoveryPollMs: number;
	private readonly overflowRescanInitialMs: number;
	private readonly overflowRescanMaxMs: number;
	private readonly overflowBackoffResetMs: number;
	private readonly watchers = new Map<string, WatcherState>();
	/**
	 * One-shot dedup so a single ENOSPC report doesn't spam logs across every
	 * watcher creation that follows it. Mirrors VS Code's `enospcErrorLogged`
	 * (parcelWatcher.ts:190). Intentionally never reset — once a process hits
	 * the inotify limit, surfacing it again per error doesn't help; the user
	 * needs to bump `fs.inotify.max_user_watches` and restart.
	 */
	private enospcErrorLogged = false;

	constructor(options: FsWatcherManagerOptions = {}) {
		this.debounceMs = options.debounceMs ?? 75;
		// Merged so a custom pattern can't silently drop node_modules/.git.
		this.ignore = options.ignore
			? [...new Set([...DEFAULT_IGNORE_PATTERNS, ...options.ignore])]
			: DEFAULT_IGNORE_PATTERNS;
		this.listGitIgnoredDirs = options.listGitIgnoredDirs;
		this.filePathsMax = options.filePathsMax ?? FILE_PATHS_MAX;
		this.recoveryPollMs = options.recoveryPollMs ?? 2_000;
		this.overflowRescanInitialMs =
			options.overflowRescanInitialMs ?? OVERFLOW_RESCAN_INITIAL_MS;
		this.overflowRescanMaxMs =
			options.overflowRescanMaxMs ?? OVERFLOW_RESCAN_MAX_MS;
		this.overflowBackoffResetMs =
			options.overflowBackoffResetMs ?? OVERFLOW_BACKOFF_RESET_MS;
	}

	async subscribe(
		options: WatchPathOptions,
		listener: WatchListener,
	): Promise<() => Promise<void>> {
		const absolutePath = normalizeAbsolutePath(options.absolutePath);
		let state = this.watchers.get(absolutePath);

		if (!state) {
			state = await this.createWatcher(absolutePath);
			this.watchers.set(absolutePath, state);
		}

		state.listeners.add(listener);

		return async () => {
			const currentState = this.watchers.get(absolutePath);
			if (!currentState) {
				return;
			}

			currentState.listeners.delete(listener);
			if (currentState.listeners.size > 0) {
				return;
			}

			// Remove from the map before touching the native layer so a fresh
			// subscribe can never reuse a state whose teardown is in flight.
			this.watchers.delete(absolutePath);
			await this.disposeWatcherState(currentState);
		};
	}

	async close(): Promise<void> {
		const states = Array.from(this.watchers.values());
		this.watchers.clear();
		await Promise.all(states.map((state) => this.disposeWatcherState(state)));
	}

	private async disposeWatcherState(state: WatcherState): Promise<void> {
		if (state.flushTimer) {
			clearTimeout(state.flushTimer);
			state.flushTimer = null;
		}
		if (state.recoveryTimer) {
			clearInterval(state.recoveryTimer);
			state.recoveryTimer = null;
		}
		this.clearOverflowRootCheck(state);
		this.clearOverflowRescan(state);
		state.generation += 1;
		state.throttler.dispose();
		const subscription = state.subscription;
		state.subscription = null;
		await unsubscribeQuietly(subscription);
	}

	/**
	 * Resolve symlinks once at watch start and record the deltas needed to
	 * map kernel-reported event paths back to the caller's requested form.
	 * Port of VS Code parcelWatcher.ts `normalizePath` (lines 488-516). Casing
	 * normalization (`realcase`) is intentionally skipped — that's macOS-only
	 * and requires a non-trivial helper from VS Code's pfs module; symlink
	 * resolution alone covers our use cases.
	 */
	private async normalizePath(absolutePath: string): Promise<{
		realPath: string;
		realPathNormalized: string;
		realPathDiffers: boolean;
	}> {
		const normalize = (input: string) =>
			process.platform === "darwin" ? input.normalize("NFC") : input;
		try {
			const resolved = await realpath(absolutePath);
			if (resolved !== absolutePath) {
				return {
					realPath: resolved,
					realPathNormalized: normalize(resolved),
					realPathDiffers: true,
				};
			}
		} catch (error) {
			// Path vanished since stat(). Watching the unresolved form would run
			// with dead ignore globs (parcel prefix-matches the resolved root).
			throw new Error(
				`Cannot watch path: failed to resolve real path: ${absolutePath} (${toErrorMessage(error)})`,
			);
		}
		return {
			realPath: absolutePath,
			realPathNormalized: normalize(absolutePath),
			realPathDiffers: false,
		};
	}

	/**
	 * Mutate parcel events in place: NFC-normalize on darwin (HFS+/APFS stores
	 * filenames in NFD; consumers compare against NFC) and map paths back from
	 * the resolved-symlink form to the caller's requested form. Port of VS Code
	 * parcelWatcher.ts `normalizeEvents` (lines 518-539). Windows root-drive
	 * workaround is omitted — desktop doesn't ship on Windows yet.
	 */
	private normalizeEvents(
		events: ParcelWatcherEvent[],
		state: WatcherState,
	): void {
		// VS Code (parcelWatcher.ts:534-537) slices by `realPathLength`
		// computed pre-NFC, which corrupts paths when NFC changes string
		// length AND the requested path was a symlink. We use path.relative
		// against the same-normalized realPath so the rebase works regardless
		// of NFC length changes.
		for (const event of events) {
			const eventPath =
				process.platform === "darwin"
					? event.path.normalize("NFC")
					: event.path;
			if (state.realPathDiffers) {
				event.path = path.join(
					state.absolutePath,
					path.relative(state.realPathNormalized, eventPath),
				);
			} else {
				event.path = eventPath;
			}
		}
	}

	/**
	 * Surface watcher errors with platform-specific guidance. Port of VS Code
	 * parcelWatcher.ts `onUnexpectedError` (lines 579-609). Two specific
	 * errors get dedicated branches:
	 *
	 * - `'No space left on device'` (ENOSPC): Linux inotify watch limit
	 *   exhausted. Log once with a remediation hint; spamming repeats doesn't
	 *   help — user has to bump the system limit and restart.
	 * - `'File system must be re-scanned'`: macOS FSEvents kernel queue
	 *   overflowed — some events were dropped and per-path bookkeeping can no
	 *   longer be trusted. Schedule a coalesced, backed-off rescan (see
	 *   `scheduleOverflowRescan`) rather than reacting per overflow: an
	 *   immediate per-overflow reaction (index invalidation + a synthetic
	 *   event) storms full disk walks and git-status refetches under
	 *   sustained churn, while never reacting leaves consumers stale forever
	 *   when the dropped events were the last ones of a burst.
	 */
	private onUnexpectedError(error: unknown, state: WatcherState): void {
		const msg = toErrorMessage(error);

		if (msg.indexOf("No space left on device") !== -1) {
			if (!this.enospcErrorLogged) {
				console.error(
					"[workspace-fs/watch] inotify watch limit reached (ENOSPC). " +
						"Increase via: echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p",
					{ absolutePath: state.absolutePath },
				);
				this.enospcErrorLogged = true;
			}
			return;
		}

		if (msg.indexOf("File system must be re-scanned") !== -1) {
			this.scheduleOverflowRescan(state);
			// The dropped events may have included the root's own deletion.
			this.scheduleOverflowRootCheck(state);
			return;
		}

		console.error("[workspace-fs/watch] Watcher error:", {
			absolutePath: state.absolutePath,
			error: msg,
		});
	}

	private async createWatcher(absolutePath: string): Promise<WatcherState> {
		const normalizedPath = normalizeAbsolutePath(absolutePath);

		try {
			const rootStats = await stat(normalizedPath);
			if (!rootStats.isDirectory()) {
				throw new Error(
					`Cannot watch path: path is not a directory: ${normalizedPath}`,
				);
			}
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				((error as NodeJS.ErrnoException).code === "ENOENT" ||
					(error as NodeJS.ErrnoException).code === "ENOTDIR")
			) {
				throw new Error(
					`Cannot watch path: path does not exist: ${normalizedPath}`,
				);
			}
			throw error;
		}

		const state: WatcherState = {
			absolutePath: normalizedPath,
			realPath: normalizedPath,
			realPathNormalized: normalizedPath,
			realPathDiffers: false,
			subscription: null,
			recoveryTimer: null,
			recovering: false,
			generation: 0,
			probeSeen: false,
			overflowRootCheckTimer: null,
			overflowRootChecksLeft: 0,
			overflowRescanTimer: null,
			overflowRescanDeadline: 0,
			overflowRescanDelayMs: this.overflowRescanInitialMs,
			overflowsCoalesced: 0,
			lastOverflowAt: 0,
			listeners: new Set<WatchListener>(),
			prunedRelPrefixes: [],
			filePaths: new Map<string, true>(),
			directoryPaths: new Set<string>(),
			pendingEvents: [],
			flushTimer: null,
			throttler: new ThrottledWorker<FsWatchEvent>(
				{
					maxWorkChunkSize: MAX_WORK_CHUNK_SIZE,
					throttleDelay: THROTTLE_DELAY_MS,
					maxBufferedWork: MAX_BUFFERED_EVENTS,
				},
				(eventChunk) => {
					for (const listener of state.listeners) {
						listener({ events: eventChunk });
					}
				},
			),
		};

		await this.attachNativeSubscription(state);

		return state;
	}

	/**
	 * Resolve the (possibly recreated) root and open the native subscription.
	 * Split from createWatcher so root-deletion recovery can re-attach to the
	 * same WatcherState without dropping its listeners.
	 */
	private async attachNativeSubscription(state: WatcherState): Promise<void> {
		const { realPath, realPathNormalized, realPathDiffers } =
			await this.normalizePath(state.absolutePath);
		state.realPath = realPath;
		state.realPathNormalized = realPathNormalized;
		state.realPathDiffers = realPathDiffers;
		const generation = ++state.generation;

		// Nested git repos/worktrees (agent tools pile these up — a full repo copy
		// each) balloon a recursive watch to millions of dirs. Discover them and
		// hand parcel a root-relative `<relative>/**` glob per repo, which prunes
		// the subtree from traversal (same mechanism as the `**/node_modules/**`
		// default — stops inotify watch creation on Linux, the ENOSPC trigger).
		// Gitignored dirs get the same treatment: repo-specific build output
		// (`__pycache__`, `packages/*/lib`, …) that the static list can't know
		// about is pruned via whatever git itself considers fully ignored.
		const [nestedRepoRelDirs, gitIgnoredRelDirs] = await Promise.all([
			this.computeNestedRepoRelDirs(realPath),
			this.computeGitIgnoredRelDirs(realPath),
		]);
		state.prunedRelPrefixes = [...nestedRepoRelDirs, ...gitIgnoredRelDirs];
		// Root-relative escaped globs: parcel matches ignores relative to the
		// watch root (its defaults are all `**/…`), so an absolute path never
		// matches. Bare paths aren't safe either — parcel's `is-glob` check
		// misclassifies paths containing glob magic (a Next.js `app/[id]` route
		// segment) as patterns. Escaping + relativizing handles both.
		const prunedDirIgnores = state.prunedRelPrefixes.map(
			(relDir) => `${escapeGlobMagic(relDir)}/**`,
		);

		// parcel dedupes native backends by (dir, ignore-set); a wedged backend
		// from the dead stream (its unsubscribe can hang) would be silently
		// joined and never deliver. The pattern matches nothing real — it only
		// forces a distinct backend identity.
		const ignore = [
			...this.ignore,
			...(generation === 1
				? []
				: [`**/.superset-watch-generation-${generation}/**`]),
			...prunedDirIgnores,
		];

		// Subscribe to the resolved real path so kernel paths come back in a
		// consistent form; we map them back to `state.absolutePath` in
		// `normalizeEvents`. Mirrors VS Code's parcelWatcher.ts:364.
		state.subscription = await subscribeToFilesystem(
			realPath,
			(error, events) => {
				if (state.generation !== generation) {
					// Late callback from a superseded stream (suspended or
					// replaced by recovery) — its events describe a dead tree.
					return;
				}
				if (error) {
					this.onUnexpectedError(error, state);
					// Continue: process whatever events did arrive alongside
					// the error. Mirrors VS Code's parcelWatcher.ts:373-378
					// pattern (log error, then onParcelEvents anyway).
				}

				// Consume the liveness probe before it reaches listeners or the index.
				const visibleEvents = events.filter((event) => {
					if (path.basename(event.path).startsWith(PROBE_PREFIX)) {
						state.probeSeen = true;
						return false;
					}
					return true;
				});

				if (visibleEvents.length === 0) {
					return;
				}

				if (process.env.SUPERSET_FS_EVENTS_DEBUG === "1") {
					console.log("[fs:debug] parcel callback", {
						path: state.absolutePath,
						count: visibleEvents.length,
						kinds: visibleEvents.map((e) => e.type),
					});
				}

				this.normalizeEvents(visibleEvents, state);
				state.pendingEvents.push(...visibleEvents);
				if (state.flushTimer) {
					return;
				}

				const flushTimer = setTimeout(() => {
					state.flushTimer = null;
					const pendingEvents = state.pendingEvents.splice(
						0,
						state.pendingEvents.length,
					);
					void this.flushPendingEvents(state, pendingEvents);
				}, this.debounceMs);
				state.flushTimer = flushTimer;
				flushTimer.unref?.();
			},
			{
				ignore,
			},
		);
	}

	/**
	 * Best-effort discovery of nested repo/worktree roots to prune, as
	 * root-relative dir paths. Never blocks watching: on failure or a truncated
	 * scan we watch with whatever we found (an unpruned subtree degrades to the
	 * pre-existing behavior, not a crash).
	 */
	private async computeNestedRepoRelDirs(realPath: string): Promise<string[]> {
		try {
			const { roots, truncated } = await findNestedRepoRoots(realPath, {
				pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
				deadlineMs: NESTED_REPO_SCAN_DEADLINE_MS,
			});
			if (truncated) {
				console.warn(
					"[workspace-fs/watch] nested-repo scan hit cap — some nested repos may still be watched",
					{ absolutePath: realPath, found: roots.length },
				);
			}
			return roots.map((root) => path.relative(realPath, root));
		} catch (error) {
			console.error("[workspace-fs/watch] nested-repo scan failed", {
				absolutePath: realPath,
				error: toErrorMessage(error),
			});
			return [];
		}
	}

	/**
	 * Fully-gitignored directories as root-relative dir paths, via the injected
	 * provider (git decides — nested .gitignore, info/exclude, and the global
	 * excludesfile all honored). Snapshot at attach time: a dir created later
	 * (first `bun dev` making `.next`) stays watched until the next attach, but
	 * the git-watcher's own ignored-path filter caps its downstream cost.
	 */
	private async computeGitIgnoredRelDirs(realPath: string): Promise<string[]> {
		if (!this.listGitIgnoredDirs) {
			return [];
		}
		try {
			const dirs = await this.listGitIgnoredDirs(realPath);
			return dirs.filter(
				(dir) =>
					dir.length > 0 &&
					!dir.startsWith("/") &&
					!dir.split("/").includes(".."),
			);
		} catch (error) {
			console.error("[workspace-fs/watch] gitignored-dir scan failed", {
				absolutePath: realPath,
				error: toErrorMessage(error),
			});
			return [];
		}
	}

	/**
	 * Re-derive the dynamic ignore set (nested repos + gitignored dirs) and
	 * swap the native subscription to it. Needed when a directory is
	 * UN-ignored: the attach-time prune otherwise keeps suppressing its events
	 * until process restart (VS Code re-subscribes on watcherExclude changes
	 * for the same reason). Growth of the set never requires this — new
	 * ignored dirs are filtered downstream.
	 *
	 * The old stream stays attached until the new one is live, but its events
	 * are dropped by the generation guard once attach begins, so a short gap
	 * is possible. Callers should follow up with a broad refresh of whatever
	 * they derive from events; the search index is invalidated here.
	 *
	 * Returns true when the subscription was actually swapped. No-swap cases:
	 * the fresh ignore set still contains every currently-pruned dir (growth
	 * is handled downstream without re-attach), or the root is absent,
	 * suspended, or recovering (the next attach re-runs the providers anyway).
	 */
	async refreshIgnores(rootAbsolutePath: string): Promise<boolean> {
		const state = this.watchers.get(normalizeAbsolutePath(rootAbsolutePath));
		if (!state || !state.subscription || state.recoveryTimer) {
			return false;
		}
		const [nestedRepoRelDirs, gitIgnoredRelDirs] = await Promise.all([
			this.computeNestedRepoRelDirs(state.realPath),
			this.computeGitIgnoredRelDirs(state.realPath),
		]);
		const fresh = new Set([...nestedRepoRelDirs, ...gitIgnoredRelDirs]);
		const shrunk = state.prunedRelPrefixes.some((dir) => !fresh.has(dir));
		if (!shrunk) {
			return false;
		}
		if (!state.subscription || state.recoveryTimer) {
			// State changed while the providers ran.
			return false;
		}
		// Detach the old stream BEFORE attaching the new one. Keeping both
		// alive briefly buys nothing (the generation bump discards old events
		// anyway) and inotify tears down watch descriptors shared across
		// coexisting parcel backends on the same dir, leaving the fresh
		// subscription deaf. The swap gap is covered by the caller's follow-up
		// broad refresh and the search-index invalidation below.
		const oldSubscription = state.subscription;
		state.subscription = null;
		state.generation += 1;
		await unsubscribeQuietly(oldSubscription);
		// Disposal or root-deletion recovery may have raced the detach.
		if (
			this.watchers.get(state.absolutePath) !== state ||
			state.recoveryTimer
		) {
			return false;
		}
		try {
			await this.attachNativeSubscription(state);
		} catch (error) {
			// The root is now unwatched; a transient failure must not leave it
			// that way silently. Reuse the root-recovery poll, which re-attaches,
			// verifies liveness, and emits a root create so consumers refetch.
			console.error(
				"[workspace-fs/watch] ignore refresh re-attach failed — entering recovery",
				{
					absolutePath: state.absolutePath,
					error: toErrorMessage(error),
				},
			);
			const timer = setInterval(
				() => void this.tryRecover(state),
				this.recoveryPollMs,
			);
			timer.unref?.();
			state.recoveryTimer = timer;
			return false;
		}
		// Events during the swap gap may have been missed.
		invalidateSearchIndexesForRoot(state.absolutePath);
		return true;
	}

	/**
	 * Whether `absolutePath` gets no events from the recursive watch on
	 * `rootAbsolutePath` — because it sits inside a pruned subtree (static
	 * defaults, nested repo, gitignored dir), lies outside the root, or no
	 * watcher exists for that root at all. Callers use this to decide whether a
	 * file needs its own targeted watch (see watch-file.ts). Errs toward `true`:
	 * a spurious targeted watch costs one fd; a missed one costs live reload.
	 */
	isPathPruned(rootAbsolutePath: string, absolutePath: string): boolean {
		const state = this.watchers.get(normalizeAbsolutePath(rootAbsolutePath));
		if (!state || !state.subscription) {
			return true;
		}
		const relative = path.relative(
			state.absolutePath,
			normalizeAbsolutePath(absolutePath),
		);
		if (relative === "" || relative.startsWith("..")) {
			return true;
		}
		return isRelPathUnderPrunedDirs(relative, state.prunedRelPrefixes);
	}

	/**
	 * Coalesce FSEvents overflows into a per-root trailing rescan: the rescan
	 * fires one window after the LAST overflow, so it never lands mid-burst.
	 * The rearm is lazy — overflows on the hot path only stamp
	 * `lastOverflowAt`; the armed timer re-checks at fire time and pushes
	 * itself out if an overflow landed inside its window (no timer-heap churn
	 * at storm rates). Sustained overflow can't postpone it forever: a batch
	 * deadline (first overflow + the cap) overrides the trailing wait, forcing
	 * a rescan at least every OVERFLOW_RESCAN_MAX_MS, and a deadline-forced
	 * fire arms a follow-up batch so the final rescan still trails the last
	 * overflow once churn settles. The window doubles per fired rescan up to
	 * the cap and resets after a quiet OVERFLOW_BACKOFF_RESET_MS.
	 */
	private scheduleOverflowRescan(state: WatcherState): void {
		const now = Date.now();
		if (now - state.lastOverflowAt >= this.overflowBackoffResetMs) {
			state.overflowRescanDelayMs = this.overflowRescanInitialMs;
		}
		state.lastOverflowAt = now;
		state.overflowsCoalesced += 1;
		if (state.overflowRescanTimer) {
			return;
		}
		state.overflowRescanDeadline = now + this.overflowRescanMaxMs;
		console.error(
			"[workspace-fs/watch] FSEvents overflow — rescan scheduled:",
			{
				absolutePath: state.absolutePath,
				delayMs: state.overflowRescanDelayMs,
			},
		);
		this.armOverflowRescan(state, now + state.overflowRescanDelayMs);
	}

	private armOverflowRescan(state: WatcherState, fireAt: number): void {
		const delayMs = Math.max(
			0,
			Math.min(fireAt, state.overflowRescanDeadline) - Date.now(),
		);
		const timer = setTimeout(() => {
			state.overflowRescanTimer = null;
			this.performOverflowRescan(state);
		}, delayMs);
		timer.unref?.();
		state.overflowRescanTimer = timer;
	}

	private performOverflowRescan(state: WatcherState): void {
		if (this.watchers.get(state.absolutePath) !== state) {
			return;
		}
		const now = Date.now();
		const windowMs = state.overflowRescanDelayMs;
		const trailingFireAt = state.lastOverflowAt + windowMs;
		if (now < trailingFireAt && now < state.overflowRescanDeadline) {
			// An overflow landed inside this window — lazy rearm to trail it.
			this.armOverflowRescan(state, trailingFireAt);
			return;
		}
		const coalescedOverflows = state.overflowsCoalesced;
		state.overflowsCoalesced = 0;
		state.overflowRescanDelayMs = Math.min(
			windowMs * 2,
			this.overflowRescanMaxMs,
		);
		console.error("[workspace-fs/watch] FSEvents overflow rescan:", {
			absolutePath: state.absolutePath,
			coalescedOverflows,
		});
		// The kernel dropped events, so the patch-maintained index can't be
		// trusted; drop it and let the next search rebuild from a disk walk.
		invalidateSearchIndexesForRoot(state.absolutePath);
		// One broad "state changed" signal so consumers (git-watcher, file
		// tree) refetch instead of trusting per-path events that never arrived.
		this.emitDirect(state, {
			events: [
				{
					kind: "overflow",
					absolutePath: state.absolutePath,
					isDirectory: true,
				},
			],
		});
		// A deadline-forced fire mid-storm hasn't seen the fs settle — arm a
		// follow-up batch to keep the trailing guarantee.
		if (now - state.lastOverflowAt < windowMs) {
			state.overflowRescanDeadline = now + this.overflowRescanMaxMs;
			this.armOverflowRescan(state, now + state.overflowRescanDelayMs);
		}
	}

	/**
	 * Deliver a batch to listeners directly, bypassing the throttler: for
	 * convergence signals (overflow rescan, recovery resume) that must not be
	 * dropped when the bounded buffer is full — exactly the burst conditions
	 * that produce them. Per-listener throws are contained so one bad
	 * subscriber can't skip siblings.
	 */
	private emitDirect(
		state: WatcherState,
		batch: { events: FsWatchEvent[] },
	): void {
		for (const listener of state.listeners) {
			try {
				listener(batch);
			} catch (error) {
				console.error("[workspace-fs/watch] direct emit listener threw", {
					absolutePath: state.absolutePath,
					error: toErrorMessage(error),
				});
			}
		}
	}

	private clearOverflowRescan(state: WatcherState): void {
		if (state.overflowRescanTimer) {
			clearTimeout(state.overflowRescanTimer);
			state.overflowRescanTimer = null;
		}
		state.overflowsCoalesced = 0;
	}

	/**
	 * A kernel overflow can swallow the root-delete event itself (reproduced
	 * with a 20k-file rm -rf), leaving the event-based detection in
	 * flushPendingEvents blind. Probe the root's existence for a bounded
	 * window after each overflow and suspend if it vanished.
	 */
	private scheduleOverflowRootCheck(state: WatcherState): void {
		state.overflowRootChecksLeft = 5;
		if (state.overflowRootCheckTimer) {
			return;
		}
		const timer = setInterval(() => {
			void (async () => {
				if (this.watchers.get(state.absolutePath) !== state) {
					this.clearOverflowRootCheck(state);
					return;
				}
				state.overflowRootChecksLeft -= 1;
				try {
					await stat(state.absolutePath);
					if (state.overflowRootChecksLeft <= 0) {
						this.clearOverflowRootCheck(state);
					}
				} catch {
					this.clearOverflowRootCheck(state);
					await this.suspendForRecovery(state);
				}
			})();
		}, 1_000);
		timer.unref?.();
		state.overflowRootCheckTimer = timer;
	}

	private clearOverflowRootCheck(state: WatcherState): void {
		if (state.overflowRootCheckTimer) {
			clearInterval(state.overflowRootCheckTimer);
			state.overflowRootCheckTimer = null;
		}
		state.overflowRootChecksLeft = 0;
	}

	/**
	 * The watch root was deleted: the native stream is dead and will never
	 * deliver again (FSEvents keeps following the old inode). Keep the state
	 * and its listeners, drop the native side, and poll for the path to
	 * reappear — VS Code's suspend/resume pattern (baseWatcher.ts).
	 */
	private async suspendForRecovery(state: WatcherState): Promise<void> {
		if (!state.subscription || state.recoveryTimer) {
			return;
		}
		if (this.watchers.get(state.absolutePath) !== state) {
			return;
		}
		console.error(
			"[workspace-fs/watch] watch root deleted — polling for recreation:",
			{ absolutePath: state.absolutePath },
		);
		const deadSubscription = state.subscription;
		state.subscription = null;
		// A stale root-delete flushed after resume would re-suspend the
		// recovered stream — invalidate the dead stream and drop its queue.
		state.generation += 1;
		state.pendingEvents.length = 0;
		if (state.flushTimer) {
			clearTimeout(state.flushTimer);
			state.flushTimer = null;
		}
		this.clearOverflowRootCheck(state);
		// Recovery's resume already invalidates the index and emits a root
		// create — a pending overflow rescan would be a redundant echo.
		this.clearOverflowRescan(state);
		// Must complete before any re-subscribe on this path: a new parcel
		// subscription opened while the dead one is still registered joins the
		// dead native backend and never delivers (verified empirically).
		await unsubscribeQuietly(deadSubscription);
		const timer = setInterval(
			() => void this.tryRecover(state),
			this.recoveryPollMs,
		);
		timer.unref?.();
		state.recoveryTimer = timer;
	}

	private async tryRecover(state: WatcherState): Promise<void> {
		if (state.recovering) {
			return;
		}
		if (this.watchers.get(state.absolutePath) !== state) {
			if (state.recoveryTimer) {
				clearInterval(state.recoveryTimer);
				state.recoveryTimer = null;
			}
			return;
		}
		state.recovering = true;
		try {
			const stats = await stat(state.absolutePath);
			if (!stats.isDirectory()) {
				return;
			}
			await this.attachNativeSubscription(state);
			if (!(await this.verifyStreamLiveness(state))) {
				// Deaf stream — detach and retry on the next poll tick.
				const deafSubscription = state.subscription;
				state.subscription = null;
				await unsubscribeQuietly(deafSubscription);
				return;
			}
		} catch {
			return;
		} finally {
			state.recovering = false;
		}
		if (state.recoveryTimer) {
			clearInterval(state.recoveryTimer);
			state.recoveryTimer = null;
		}
		// Ownership can change across the awaits above: if the state was
		// disposed meanwhile (last listener unsubscribed), the subscription we
		// just attached is orphaned and would leak a native watcher.
		if (this.watchers.get(state.absolutePath) !== state) {
			const orphaned = state.subscription;
			state.subscription = null;
			void unsubscribeQuietly(orphaned);
			return;
		}
		// The recreated tree is unknown: reset per-path tracking, drop the
		// search index, and emit a root create so consumers refetch. Direct
		// delivery — this resume signal is a convergence signal like the
		// overflow rescan and must not be dropped by a full throttler buffer.
		state.filePaths.clear();
		state.directoryPaths.clear();
		invalidateSearchIndexesForRoot(state.absolutePath);
		console.error("[workspace-fs/watch] watch root recreated — resumed:", {
			absolutePath: state.absolutePath,
		});
		this.emitDirect(state, {
			events: [
				{
					kind: "create",
					absolutePath: state.absolutePath,
					isDirectory: true,
				},
			],
		});
	}

	/**
	 * Write a probe file and wait for its event: proves the freshly attached
	 * stream is actually capturing. The probe never reaches listeners (the
	 * parcel callback consumes anything with PROBE_PREFIX).
	 */
	private async verifyStreamLiveness(state: WatcherState): Promise<boolean> {
		const probePath = path.join(
			state.absolutePath,
			`${PROBE_PREFIX}${state.generation}`,
		);
		state.probeSeen = false;
		try {
			await writeFile(probePath, "");
		} catch {
			return false;
		}
		try {
			const deadline = Date.now() + PROBE_TIMEOUT_MS;
			while (!state.probeSeen && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return state.probeSeen;
		} finally {
			await rm(probePath, { force: true }).catch(() => {});
		}
	}

	private async flushPendingEvents(
		state: WatcherState,
		events: ParcelWatcherEvent[],
	): Promise<void> {
		if (events.length === 0) {
			return;
		}

		const coalescedEvents = coalesceWatchEvents(events);
		if (coalescedEvents.length === 0) {
			return;
		}

		// Sequential so LRU mutations land in event order, not stat-completion
		// order. Batches are small (debounced ~75 ms) and stat is fast on a
		// warm fs, so the parallelism wasn't worth the eviction nondeterminism.
		const internalEvents: InternalWatchEvent[] = [];
		for (const event of coalescedEvents) {
			internalEvents.push(await this.normalizeEvent(state, event));
		}
		const reconciledEvents = reconcileRenameEvents(internalEvents);

		const searchPatchEvents = reconciledEvents
			.map(internalToSearchPatchEvent)
			.filter((e): e is SearchPatchEvent => e !== null);
		patchSearchIndexesForRoot(state.absolutePath, searchPatchEvents);

		// A rename away from the root also leaves the native stream dead.
		// Suspend BEFORE emitting: a listener may react to the root-delete by
		// recreating the directory, and the dead native subscription must be
		// fully released while the path is still absent (see suspendForRecovery).
		const rootDeleted = reconciledEvents.some(
			(event) =>
				(event.kind === "delete" &&
					event.absolutePath === state.absolutePath) ||
				(event.kind === "rename" &&
					event.oldAbsolutePath === state.absolutePath),
		);
		if (rootDeleted) {
			await this.suspendForRecovery(state);
		}

		const publicEvents = reconciledEvents.map(internalToFsWatchEvent);
		this.emit(state, { events: publicEvents });
	}

	private async normalizeEvent(
		state: WatcherState,
		event: ParcelWatcherEvent,
	): Promise<InternalWatchEvent> {
		const absolutePath = normalizeAbsolutePath(event.path);
		let isDirectory: boolean | undefined =
			state.directoryPaths.has(absolutePath);

		if (event.type === "delete") {
			state.filePaths.delete(absolutePath);
			state.directoryPaths.delete(absolutePath);
		} else {
			try {
				const stats = await stat(absolutePath);
				isDirectory = stats.isDirectory();
				if (isDirectory) {
					// Directories are uncapped (bounded by repo structure).
					state.directoryPaths.add(absolutePath);
					state.filePaths.delete(absolutePath);
				} else {
					// LRU bump + evict oldest file when at cap. Map iteration is
					// insertion-order, so the first key is least-recently-used.
					state.filePaths.delete(absolutePath);
					if (state.filePaths.size >= this.filePathsMax) {
						const oldestKey = state.filePaths.keys().next().value;
						if (oldestKey) state.filePaths.delete(oldestKey);
					}
					state.filePaths.set(absolutePath, true);
					state.directoryPaths.delete(absolutePath);
				}
			} catch {
				// The stat lost a race with whatever changed the path again (the
				// ordinary case for the rename that produced this event), so all
				// we have left is what we already recorded. With no record, say
				// nothing: reporting "file" for a directory we couldn't inspect
				// puts it in consumers' trees as a file node, where it can't be
				// expanded and poisons every lookup beneath it (DESKTOP-11E).
				if (state.directoryPaths.has(absolutePath)) {
					isDirectory = true;
				} else if (state.filePaths.has(absolutePath)) {
					isDirectory = false;
				} else {
					isDirectory = undefined;
				}
			}
		}

		return {
			kind: event.type,
			absolutePath,
			isDirectory,
		};
	}

	private emit(state: WatcherState, batch: { events: FsWatchEvent[] }): void {
		// Route through ThrottledWorker so a legitimate event burst (mass
		// refactor, branch checkout) can't pin a CPU draining listeners or
		// grow the JS heap unbounded. Past MAX_BUFFERED_EVENTS, work() returns
		// false; we drop with a one-shot warning per state.
		const accepted = state.throttler.work(batch.events);
		if (!accepted) {
			console.warn(
				"[workspace-fs/watch] throttler buffer full — dropping events",
				{
					absolutePath: state.absolutePath,
					droppedBatchSize: batch.events.length,
					pending: state.throttler.pendingCount,
				},
			);
		}
	}
}
