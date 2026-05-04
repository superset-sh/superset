import { stat } from "node:fs/promises";
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
import type { FsWatchEvent } from "./types";

// Cap per-watcher file-path memory so a monotonic stream of unique paths
// (log rotation, hashed build artifacts) doesn't grow JS heap unbounded.
// Directories are tracked separately and uncapped — directory count per
// worktree is bounded by repo structure (O(100s) even for huge repos), and
// losing a directory hint causes a delete event to fall back to file-only
// search-index pruning, leaving stale descendant entries until the next
// full rebuild.
const FILE_PATHS_MAX = 10_000;

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
	absolutePath: string;
	subscription: AsyncSubscription;
	listeners: Set<WatchListener>;
	filePaths: Map<string, true>;
	directoryPaths: Set<string>;
	pendingEvents: ParcelWatcherEvent[];
	flushTimer: ReturnType<typeof setTimeout> | null;
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
				await state.subscription.unsubscribe();
			}),
		);
		this.watchers.clear();
	}

	private async createWatcher(absolutePath: string): Promise<WatcherState> {
		const state: WatcherState = {
			absolutePath: normalizeAbsolutePath(absolutePath),
			subscription: null as unknown as AsyncSubscription,
			listeners: new Set<WatchListener>(),
			filePaths: new Map<string, true>(),
			directoryPaths: new Set<string>(),
			pendingEvents: [],
			flushTimer: null,
		};

		try {
			const rootStats = await stat(state.absolutePath);
			if (!rootStats.isDirectory()) {
				throw new Error(
					`Cannot watch path: path is not a directory: ${state.absolutePath}`,
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
					`Cannot watch path: path does not exist: ${state.absolutePath}`,
				);
			}
			throw error;
		}

		state.subscription = await subscribeToFilesystem(
			state.absolutePath,
			(error, events) => {
				if (error) {
					console.error("[workspace-fs/watch] Watcher error:", {
						absolutePath: state.absolutePath,
						error: toErrorMessage(error),
					});
					this.emit(state, {
						events: [{ kind: "overflow", absolutePath: state.absolutePath }],
					});
					invalidateSearchIndexesForRoot(state.absolutePath);
					return;
				}

				if (events.length === 0) {
					return;
				}

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
		for (const listener of state.listeners) {
			listener(batch);
		}
	}
}
