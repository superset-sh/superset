import path from "node:path";
import type { Event as ParcelWatcherEvent } from "@parcel/watcher";
import { normalizeAbsolutePath } from "./paths";

/**
 * Pure event algebra for the file watcher: per-path coalescing of raw
 * parcel events and delete/create pair reconciliation into renames.
 * No I/O and no manager state — see watch.ts for the FsWatcherManager.
 */

export interface InternalWatchEvent {
	kind: "create" | "update" | "delete" | "rename" | "overflow";
	absolutePath: string;
	oldAbsolutePath?: string;
	isDirectory: boolean;
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
