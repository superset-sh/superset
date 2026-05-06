export type SelectionState = Record<string, Set<string>>;

export function togglePathInSelection(
	prev: SelectionState,
	projectId: string,
	path: string,
): SelectionState {
	const current = new Set(prev[projectId] ?? []);
	if (current.has(path)) current.delete(path);
	else current.add(path);
	return { ...prev, [projectId]: current };
}

export function toggleProjectInSelection(
	prev: SelectionState,
	projectId: string,
	allPaths: string[],
): SelectionState {
	const current = prev[projectId] ?? new Set<string>();
	const allSelected =
		allPaths.length > 0 && allPaths.every((p) => current.has(p));
	return {
		...prev,
		[projectId]: allSelected ? new Set() : new Set(allPaths),
	};
}

export function countSelected(state: SelectionState): number {
	let total = 0;
	for (const set of Object.values(state)) total += set.size;
	return total;
}

export function initializeProjectSelection(
	prev: SelectionState,
	projectId: string,
	paths: string[],
): SelectionState {
	if (prev[projectId]) return prev;
	return { ...prev, [projectId]: new Set(paths) };
}
