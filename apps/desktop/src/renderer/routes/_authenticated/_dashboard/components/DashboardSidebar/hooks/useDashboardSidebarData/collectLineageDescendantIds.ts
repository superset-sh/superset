/**
 * All lineage descendants of `rootId`, walked breadth-first over parent
 * edges with a visited guard so corrupt (cyclic) edge sets terminate.
 * Used by drag commits to move a parent's subtree between containers as
 * one unit instead of stranding re-rooted children behind.
 */
export function collectLineageDescendantIds(
	edges: Array<{ id: string; parentWorkspaceId: string | null }>,
	rootId: string,
): string[] {
	const childrenByParentId = new Map<string, string[]>();
	for (const edge of edges) {
		if (!edge.parentWorkspaceId) continue;
		const children = childrenByParentId.get(edge.parentWorkspaceId) ?? [];
		children.push(edge.id);
		childrenByParentId.set(edge.parentWorkspaceId, children);
	}
	const result: string[] = [];
	const visited = new Set<string>([rootId]);
	const queue = [rootId];
	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined) break;
		for (const child of childrenByParentId.get(current) ?? []) {
			if (visited.has(child)) continue;
			visited.add(child);
			result.push(child);
			queue.push(child);
		}
	}
	return result;
}
