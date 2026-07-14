import { realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type AsyncSubscription,
	type Event as ParcelWatcherEvent,
	subscribe as subscribeToFilesystem,
} from "@parcel/watcher";
import { toErrorMessage } from "./error-message";
import { normalizeAbsolutePath } from "./paths";
import {
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

// Recovery liveness probe: a freshly attached FSEvents stream can be deaf for
// a sub-second window after subscribe() resolves (observed on a busy Electron
// main loop) — writes in that window are missed forever. Recovery writes a
// probe file and only announces the resumed root once its event arrives.
const PROBE_PREFIX = ".superset-watcher-probe-";
const PROBE_TIMEOUT_MS = 4_000;

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
	listeners: Set<WatchListener>;
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
	return {
		kind: event.kind,
		absolutePath: event.absolutePath,
		oldAbsolutePath: event.oldAbsolutePath,
		isDirectory: event.isDirectory,
	};
}

export interface FsWatcherManagerOptions {
	debounceMs?: number;
	ignore?: string[];
	/** Per-watcher LRU cap on tracked file paths. Test-only override. */
	filePathsMax?: number;
	/** How often a suspended watcher polls for its deleted root to reappear. */
	recoveryPollMs?: number;
}

export class FsWatcherManager {
	private readonly debounceMs: number;
	private readonly ignore: string[];
	private readonly filePathsMax: number;
	private readonly recoveryPollMs: number;
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
		this.filePathsMax = options.filePathsMax ?? FILE_PATHS_MAX;
		this.recoveryPollMs = options.recoveryPollMs ?? 2_000;
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
	 *   overflowed. Log and invalidate the search index (next search rebuilds
	 *   from disk). Crucially, do NOT emit a synthetic event to listeners —
	 *   overflow means "some events were dropped," not "git state changed,"
	 *   and downstream consumers (git-watcher → renderer's useGitStatus →
	 *   host-service git.getStatus) would interpret it as the latter and storm
	 *   the host-service with git subprocess spawns.
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
			console.error("[workspace-fs/watch] FSEvents overflow:", {
				absolutePath: state.absolutePath,
				error: msg,
			});
			// The kernel dropped events, so patch-based index maintenance can no
			// longer be trusted; drop the index and let the next search rebuild
			// from a fresh disk walk. Cheap (a map delete), so no debounce.
			invalidateSearchIndexesForRoot(state.absolutePath);
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
			listeners: new Set<WatchListener>(),
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

		// parcel dedupes native backends by (dir, ignore-set); a wedged backend
		// from the dead stream (its unsubscribe can hang) would be silently
		// joined and never deliver. The pattern matches nothing real — it only
		// forces a distinct backend identity.
		const ignore =
			generation === 1
				? this.ignore
				: [...this.ignore, `**/.superset-watch-generation-${generation}/**`];

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
	 * The watch root was deleted: the native stream is dead and will never
	 * deliver again (FSEvents keeps following the old inode). Keep the state
	 * and its listeners, drop the native side, and poll for the path to
	 * reappear — VS Code's suspend/resume pattern (baseWatcher.ts).
	 */
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
		// search index, and emit a root create so consumers refetch.
		state.filePaths.clear();
		state.directoryPaths.clear();
		invalidateSearchIndexesForRoot(state.absolutePath);
		console.error("[workspace-fs/watch] watch root recreated — resumed:", {
			absolutePath: state.absolutePath,
		});
		this.emit(state, {
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
		let isDirectory = state.directoryPaths.has(absolutePath);

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
				isDirectory = state.directoryPaths.has(absolutePath);
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
