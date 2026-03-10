import { stat } from "node:fs/promises";
import path from "node:path";
import {
	type AsyncSubscription,
	type Event as ParcelWatcherEvent,
	subscribe as subscribeToFilesystem,
} from "@parcel/watcher";
import { normalizeAbsolutePath, toRelativePath } from "./paths";
import {
	DEFAULT_IGNORE_PATTERNS,
	invalidateSearchIndexesForRoot,
	patchSearchIndexesForRoot,
} from "./search";
import type { WorkspaceFsWatchEvent } from "./types";

export interface WorkspaceWatchSubscriptionOptions {
	workspaceId: string;
	rootPath: string;
}

type WorkspaceWatchListener = (event: WorkspaceFsWatchEvent) => void;

interface WorkspaceWatcherState {
	workspaceId: string;
	rootPath: string;
	revision: number;
	subscription: AsyncSubscription;
	listeners: Set<WorkspaceWatchListener>;
	pathTypes: Map<string, boolean>;
	pendingEvents: ParcelWatcherEvent[];
	flushTimer: ReturnType<typeof setTimeout> | null;
}

type WorkspaceFsCreateDeleteEvent = {
	type: "create" | "delete";
	workspaceId: string;
	absolutePath: string;
	isDirectory: boolean;
	revision: number;
};

type RenameCandidate = WorkspaceFsCreateDeleteEvent & { index: number };

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
	events: WorkspaceFsWatchEvent[],
): WorkspaceFsWatchEvent[] {
	const deletes: RenameCandidate[] = [];
	const creates: RenameCandidate[] = [];

	for (const [index, event] of events.entries()) {
		if (event.type === "delete") {
			deletes.push({
				index,
				type: "delete",
				workspaceId: event.workspaceId,
				absolutePath: event.absolutePath,
				isDirectory: event.isDirectory,
				revision: event.revision,
			});
		} else if (event.type === "create") {
			creates.push({
				index,
				type: "create",
				workspaceId: event.workspaceId,
				absolutePath: event.absolutePath,
				isDirectory: event.isDirectory,
				revision: event.revision,
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

	const renameByCreateIndex = new Map<
		number,
		Extract<WorkspaceFsWatchEvent, { type: "rename" }>
	>();
	const consumedIndexes = new Set<number>();

	for (const { deleteCandidate, createCandidate } of pairs) {
		consumedIndexes.add(deleteCandidate.index);
		consumedIndexes.add(createCandidate.index);
		renameByCreateIndex.set(createCandidate.index, {
			type: "rename",
			workspaceId: createCandidate.workspaceId,
			oldAbsolutePath: deleteCandidate.absolutePath,
			absolutePath: createCandidate.absolutePath,
			isDirectory: createCandidate.isDirectory,
			revision: createCandidate.revision,
		});
	}

	const reconciled: WorkspaceFsWatchEvent[] = [];
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

export interface WorkspaceFsWatcherManagerOptions {
	debounceMs?: number;
	ignore?: string[];
}

export class WorkspaceFsWatcherManager {
	private readonly debounceMs: number;
	private readonly ignore: string[];
	private readonly watchers = new Map<string, WorkspaceWatcherState>();

	constructor(options: WorkspaceFsWatcherManagerOptions = {}) {
		this.debounceMs = options.debounceMs ?? 75;
		this.ignore = options.ignore ?? DEFAULT_IGNORE_PATTERNS;
	}

	async subscribe(
		options: WorkspaceWatchSubscriptionOptions,
		listener: WorkspaceWatchListener,
	): Promise<() => Promise<void>> {
		const rootPath = normalizeAbsolutePath(options.rootPath);
		const key = this.getWatcherKey(options.workspaceId, rootPath);
		let state = this.watchers.get(key);

		if (!state) {
			state = await this.createWatcher({
				workspaceId: options.workspaceId,
				rootPath,
			});
			this.watchers.set(key, state);
		}

		state.listeners.add(listener);

		return async () => {
			const currentState = this.watchers.get(key);
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
			this.watchers.delete(key);
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

	private getWatcherKey(workspaceId: string, rootPath: string): string {
		return `${workspaceId}::${rootPath}`;
	}

	private async createWatcher(
		options: WorkspaceWatchSubscriptionOptions,
	): Promise<WorkspaceWatcherState> {
		const state: WorkspaceWatcherState = {
			workspaceId: options.workspaceId,
			rootPath: normalizeAbsolutePath(options.rootPath),
			revision: 0,
			subscription: null as unknown as AsyncSubscription,
			listeners: new Set<WorkspaceWatchListener>(),
			pathTypes: new Map<string, boolean>(),
			pendingEvents: [],
			flushTimer: null,
		};

		state.subscription = await subscribeToFilesystem(
			state.rootPath,
			(error, events) => {
				if (error) {
					console.error("[workspace-fs/watch] Watcher error:", {
						workspaceId: state.workspaceId,
						rootPath: state.rootPath,
						error,
					});
					this.emit(state, {
						type: "overflow",
						workspaceId: state.workspaceId,
						revision: this.nextRevision(state),
					});
					invalidateSearchIndexesForRoot(state.rootPath);
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
		state: WorkspaceWatcherState,
		events: ParcelWatcherEvent[],
	): Promise<void> {
		if (events.length === 0) {
			return;
		}

		const coalescedEvents = coalesceWatchEvents(events);
		if (coalescedEvents.length === 0) {
			return;
		}

		const normalizedEvents = await Promise.all(
			coalescedEvents.map((event) => this.normalizeEvent(state, event)),
		);
		const reconciledEvents = reconcileRenameEvents(normalizedEvents);
		patchSearchIndexesForRoot(state.rootPath, reconciledEvents);

		for (const normalizedEvent of reconciledEvents) {
			this.emit(state, normalizedEvent);
		}
	}

	private async normalizeEvent(
		state: WorkspaceWatcherState,
		event: ParcelWatcherEvent,
	): Promise<WorkspaceFsWatchEvent> {
		const absolutePath = normalizeAbsolutePath(event.path);
		let isDirectory = state.pathTypes.get(absolutePath) ?? false;

		if (event.type === "delete") {
			state.pathTypes.delete(absolutePath);
		} else {
			try {
				const stats = await stat(absolutePath);
				isDirectory = stats.isDirectory();
				state.pathTypes.set(absolutePath, isDirectory);
			} catch {
				isDirectory = state.pathTypes.get(absolutePath) ?? false;
			}
		}

		return {
			type: event.type,
			workspaceId: state.workspaceId,
			absolutePath,
			isDirectory,
			revision: this.nextRevision(state),
		};
	}

	private nextRevision(state: WorkspaceWatcherState): number {
		state.revision += 1;
		return state.revision;
	}

	private emit(
		state: WorkspaceWatcherState,
		event: WorkspaceFsWatchEvent,
	): void {
		for (const listener of state.listeners) {
			listener(event);
		}
	}
}

export function toFileSystemChangeEvent(
	event: WorkspaceFsWatchEvent,
	rootPath: string,
):
	| {
			type: "create" | "update" | "delete";
			absolutePath: string;
			relativePath: string;
			isDirectory: boolean;
			revision: number;
	  }
	| {
			type: "rename";
			oldAbsolutePath: string;
			absolutePath: string;
			oldRelativePath: string;
			relativePath: string;
			isDirectory: boolean;
			revision: number;
	  }
	| {
			type: "overflow";
			revision: number;
	  } {
	if (event.type === "overflow") {
		return {
			type: "overflow",
			revision: event.revision,
		};
	}

	if (event.type === "rename") {
		return {
			type: "rename",
			oldAbsolutePath: event.oldAbsolutePath,
			absolutePath: event.absolutePath,
			oldRelativePath: toRelativePath(rootPath, event.oldAbsolutePath),
			relativePath: toRelativePath(rootPath, event.absolutePath),
			isDirectory: event.isDirectory,
			revision: event.revision,
		};
	}

	return {
		type: event.type,
		absolutePath: event.absolutePath,
		relativePath: toRelativePath(rootPath, event.absolutePath),
		isDirectory: event.isDirectory,
		revision: event.revision,
	};
}
