import { realpath, stat } from "node:fs/promises";
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
	patchSearchIndexesForRoot,
	type SearchPatchEvent,
} from "./search";
import { ThrottledWorker } from "./throttled-worker";
import type { FsWatchEvent } from "./types";

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

export interface WatchPathOptions {
	absolutePath: string;
	recursive?: boolean;
}

export interface InternalWatchEvent {
	kind: "create" | "update" | "delete" | "rename" | "overflow";
	absolutePath: string;
	oldAbsolutePath?: string;
	isDirectory: boolean;
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
	subscription: AsyncSubscription;
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

function coalesceWatchEvent(
	current: ParcelWatcherEvent | undefined,
	next: ParcelWatcherEvent,
): ParcelWatcherEvent | null {
	if (!current) {
		return next;
	}

	if (current.type === "create") {
		if (next.type === "delete") {
			return null;
		}
		return current;
	}

	if (current.type === "update") {
		if (next.type === "delete") {
			return next;
		}
		if (next.type === "create") {
			return {
				type: "update",
				path: next.path,
			};
		}
		return current;
	}

	if (next.type === "create") {
		return {
			type: "update",
			path: next.path,
		};
	}

	return next;
}

export function coalesceWatchEvents(
	events: ParcelWatcherEvent[],
): ParcelWatcherEvent[] {
	const coalescedByPath = new Map<string, ParcelWatcherEvent>();

	for (const event of events) {
		const nextEvent = coalesceWatchEvent(
			coalescedByPath.get(event.path),
			event,
		);
		if (nextEvent) {
			coalescedByPath.set(event.path, nextEvent);
			continue;
		}
		coalescedByPath.delete(event.path);
	}

	return Array.from(coalescedByPath.values());
}

function getParentPath(absolutePath: string): string {
	return normalizeAbsolutePath(path.dirname(absolutePath));
}

function getBaseName(absolutePath: string): string {
	return path.basename(absolutePath);
}

interface RenameCandidate {
	kind: "create" | "delete";
	absolutePath: string;
	isDirectory: boolean;
	index: number;
}

function pairRenameCandidates(
	deletes: RenameCandidate[],
	creates: RenameCandidate[],
): Array<{
	deleteCandidate: RenameCandidate;
	createCandidate: RenameCandidate;
}> {
	const pairs: Array<{
		deleteCandidate: RenameCandidate;
		createCandidate: RenameCandidate;
	}> = [];
	const usedDeleteIndexes = new Set<number>();
	const usedCreateIndexes = new Set<number>();

	const collectUniquePairs = (
		keySelector: (candidate: RenameCandidate) => string,
	): void => {
		const deletesByKey = new Map<string, RenameCandidate[]>();
		const createsByKey = new Map<string, RenameCandidate[]>();

		for (const candidate of deletes) {
			if (usedDeleteIndexes.has(candidate.index)) {
				continue;
			}
			const key = keySelector(candidate);
			const group = deletesByKey.get(key);
			if (group) {
				group.push(candidate);
			} else {
				deletesByKey.set(key, [candidate]);
			}
		}

		for (const candidate of creates) {
			if (usedCreateIndexes.has(candidate.index)) {
				continue;
			}
			const key = keySelector(candidate);
			const group = createsByKey.get(key);
			if (group) {
				group.push(candidate);
			} else {
				createsByKey.set(key, [candidate]);
			}
		}

		for (const [key, deleteGroup] of deletesByKey.entries()) {
			const createGroup = createsByKey.get(key);
			if (
				!createGroup ||
				deleteGroup.length !== 1 ||
				createGroup.length !== 1
			) {
				continue;
			}

			const deleteCandidate = deleteGroup[0];
			const createCandidate = createGroup[0];
			if (!deleteCandidate || !createCandidate) {
				continue;
			}
			usedDeleteIndexes.add(deleteCandidate.index);
			usedCreateIndexes.add(createCandidate.index);
			pairs.push({ deleteCandidate, createCandidate });
		}
	};

	collectUniquePairs(
		(candidate) =>
			`${candidate.isDirectory ? "dir" : "file"}::parent::${getParentPath(candidate.absolutePath)}`,
	);
	collectUniquePairs(
		(candidate) =>
			`${candidate.isDirectory ? "dir" : "file"}::basename::${getBaseName(candidate.absolutePath)}`,
	);

	const remainingDeletes = deletes.filter(
		(candidate) => !usedDeleteIndexes.has(candidate.index),
	);
	const remainingCreates = creates.filter(
		(candidate) => !usedCreateIndexes.has(candidate.index),
	);
	const remainingDelete = remainingDeletes[0];
	const remainingCreate = remainingCreates[0];

	if (
		remainingDeletes.length === 1 &&
		remainingCreates.length === 1 &&
		remainingDelete &&
		remainingCreate &&
		remainingDelete.isDirectory === remainingCreate.isDirectory
	) {
		pairs.push({
			deleteCandidate: remainingDelete,
			createCandidate: remainingCreate,
		});
	}

	return pairs;
}

export function reconcileRenameEvents(
	events: InternalWatchEvent[],
): InternalWatchEvent[] {
	const deletes: RenameCandidate[] = [];
	const creates: RenameCandidate[] = [];

	for (const [index, event] of events.entries()) {
		if (event.kind === "delete") {
			deletes.push({
				index,
				kind: "delete",
				absolutePath: event.absolutePath,
				isDirectory: event.isDirectory,
			});
		} else if (event.kind === "create") {
			creates.push({
				index,
				kind: "create",
				absolutePath: event.absolutePath,
				isDirectory: event.isDirectory,
			});
		}
	}

	if (deletes.length === 0 || creates.length === 0) {
		return events;
	}

	const pairs = pairRenameCandidates(deletes, creates);
	if (pairs.length === 0) {
		return events;
	}

	const renameByCreateIndex = new Map<number, InternalWatchEvent>();
	const consumedIndexes = new Set<number>();

	for (const { deleteCandidate, createCandidate } of pairs) {
		consumedIndexes.add(deleteCandidate.index);
		consumedIndexes.add(createCandidate.index);
		renameByCreateIndex.set(createCandidate.index, {
			kind: "rename",
			oldAbsolutePath: deleteCandidate.absolutePath,
			absolutePath: createCandidate.absolutePath,
			isDirectory: createCandidate.isDirectory,
		});
	}

	const reconciled: InternalWatchEvent[] = [];
	for (const [index, event] of events.entries()) {
		const renameEvent = renameByCreateIndex.get(index);
		if (renameEvent) {
			reconciled.push(renameEvent);
			continue;
		}

		if (consumedIndexes.has(index)) {
			continue;
		}

		reconciled.push(event);
	}

	return reconciled;
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
}

export class FsWatcherManager {
	private readonly debounceMs: number;
	private readonly ignore: string[];
	private readonly filePathsMax: number;
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
		this.ignore = options.ignore ?? DEFAULT_IGNORE_PATTERNS;
		this.filePathsMax = options.filePathsMax ?? FILE_PATHS_MAX;
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

			if (currentState.flushTimer) {
				clearTimeout(currentState.flushTimer);
				currentState.flushTimer = null;
			}

			currentState.throttler.dispose();
			await currentState.subscription.unsubscribe();
			this.watchers.delete(absolutePath);
		};
	}

	async close(): Promise<void> {
		await Promise.all(
			Array.from(this.watchers.values()).map(async (state) => {
				if (state.flushTimer) {
					clearTimeout(state.flushTimer);
					state.flushTimer = null;
				}
				state.throttler.dispose();
				await state.subscription.unsubscribe();
			}),
		);
		this.watchers.clear();
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
		} catch {
			// realpath fails on non-existent paths; the caller already
			// validated via stat() above, so any failure here is benign —
			// fall through to using the original path.
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
	 *   overflowed. Just log. Crucially, do NOT emit a synthetic event to
	 *   listeners — overflow means "some events were dropped," not "git state
	 *   changed," and downstream consumers (git-watcher → renderer's
	 *   useGitStatus → host-service git.getStatus) would interpret it as the
	 *   latter and storm the host-service with git subprocess spawns.
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

		const { realPath, realPathNormalized, realPathDiffers } =
			await this.normalizePath(normalizedPath);

		const state: WatcherState = {
			absolutePath: normalizedPath,
			realPath,
			realPathNormalized,
			realPathDiffers,
			subscription: null as unknown as AsyncSubscription,
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

		// Subscribe to the resolved real path so kernel paths come back in a
		// consistent form; we map them back to `state.absolutePath` in
		// `normalizeEvents`. Mirrors VS Code's parcelWatcher.ts:364.
		state.subscription = await subscribeToFilesystem(
			realPath,
			(error, events) => {
				if (error) {
					this.onUnexpectedError(error, state);
					// Continue: process whatever events did arrive alongside
					// the error. Mirrors VS Code's parcelWatcher.ts:373-378
					// pattern (log error, then onParcelEvents anyway).
				}

				if (events.length === 0) {
					return;
				}

				this.normalizeEvents(events, state);
				state.pendingEvents.push(...events);
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
				ignore: this.ignore,
			},
		);

		return state;
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
