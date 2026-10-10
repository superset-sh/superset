import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import type { WorkspaceLocalStateRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export async function pruneArchivedWorkspaceState({
	collection,
	getArchivedIds,
	signal,
	cleanupRuntimes,
}: {
	collection: AppCollections["v2WorkspaceLocalState"];
	getArchivedIds: (workspaceIds: string[]) => Promise<string[]>;
	signal: AbortSignal;
	cleanupRuntimes: (rows: WorkspaceLocalStateRow[]) => void;
}): Promise<number> {
	const snapshot = new Map(collection.state);
	const workspaceIds = [...snapshot.keys()];
	const archivedIds = new Set<string>();
	for (let offset = 0; offset < workspaceIds.length; offset += 500) {
		signal.throwIfAborted();
		const batch = workspaceIds.slice(offset, offset + 500);
		const requestedIds = new Set(batch);
		for (const id of await getArchivedIds(batch)) {
			if (requestedIds.has(id)) archivedIds.add(id);
		}
	}
	signal.throwIfAborted();
	const removableRows = [...snapshot.values()].filter(
		(row) =>
			archivedIds.has(row.workspaceId) &&
			collection.get(row.workspaceId) === row,
	);
	if (removableRows.length > 0) {
		await collection.delete(removableRows.map((row) => row.workspaceId))
			.isPersisted.promise;
		cleanupRuntimes(removableRows);
	}
	return removableRows.length;
}
