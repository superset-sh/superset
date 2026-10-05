import { projectCollectionId } from "@superset/shared/project-collections";

export function pruneCollapsedCollections(
	collapsed: Record<string, true>,
	machineId: string,
	knownTags: readonly string[],
): Record<string, true> {
	const prefix = `${machineId}:${projectCollectionId("")}`;
	const knownKeys = new Set(
		knownTags.map((tag) => `${machineId}:${projectCollectionId(tag)}`),
	);
	const staleKeys = Object.keys(collapsed).filter(
		(key) => key.startsWith(prefix) && !knownKeys.has(key),
	);
	if (!staleKeys.length) return collapsed;
	const next = { ...collapsed };
	for (const key of staleKeys) delete next[key];
	return next;
}
