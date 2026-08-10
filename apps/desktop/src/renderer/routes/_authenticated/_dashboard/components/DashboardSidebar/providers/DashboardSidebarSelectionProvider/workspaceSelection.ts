export interface WorkspaceSelectionState {
	projectId: string | null;
	selectedIds: string[];
	anchorId: string | null;
}

export type WorkspaceSelectionMode = "toggle" | "range" | "add-range";

export interface ApplyWorkspaceSelectionOptions {
	workspaceId: string;
	projectId: string;
	orderedWorkspaceIds: string[];
	mode: WorkspaceSelectionMode;
}

export const EMPTY_WORKSPACE_SELECTION: WorkspaceSelectionState = {
	projectId: null,
	selectedIds: [],
	anchorId: null,
};

function selectedIdsInVisualOrder(
	orderedWorkspaceIds: string[],
	selectedIds: ReadonlySet<string>,
	preserveIds: readonly string[] = [],
): string[] {
	const visibleIds = orderedWorkspaceIds.filter((id) => selectedIds.has(id));
	const visibleIdSet = new Set(orderedWorkspaceIds);
	const hiddenIds = preserveIds.filter(
		(id) => selectedIds.has(id) && !visibleIdSet.has(id),
	);
	return [...visibleIds, ...hiddenIds];
}

function singleWorkspaceSelection(
	workspaceId: string,
	projectId: string,
): WorkspaceSelectionState {
	return {
		projectId,
		selectedIds: [workspaceId],
		anchorId: workspaceId,
	};
}

export function applyWorkspaceSelection(
	state: WorkspaceSelectionState,
	{
		workspaceId,
		projectId,
		orderedWorkspaceIds,
		mode,
	}: ApplyWorkspaceSelectionOptions,
): WorkspaceSelectionState {
	if (
		state.projectId !== projectId ||
		!orderedWorkspaceIds.includes(workspaceId)
	) {
		return singleWorkspaceSelection(workspaceId, projectId);
	}

	if (mode === "toggle") {
		const selectedIds = new Set(state.selectedIds);
		if (selectedIds.has(workspaceId)) {
			selectedIds.delete(workspaceId);
		} else {
			selectedIds.add(workspaceId);
		}

		if (selectedIds.size === 0) return EMPTY_WORKSPACE_SELECTION;

		return {
			projectId,
			selectedIds: selectedIdsInVisualOrder(
				orderedWorkspaceIds,
				selectedIds,
				state.selectedIds,
			),
			anchorId: workspaceId,
		};
	}

	const anchorIndex = state.anchorId
		? orderedWorkspaceIds.indexOf(state.anchorId)
		: -1;
	const workspaceIndex = orderedWorkspaceIds.indexOf(workspaceId);
	if (anchorIndex === -1 || workspaceIndex === -1) {
		if (mode === "add-range") {
			const selectedIds = new Set([...state.selectedIds, workspaceId]);
			return {
				projectId,
				selectedIds: selectedIdsInVisualOrder(
					orderedWorkspaceIds,
					selectedIds,
					state.selectedIds,
				),
				anchorId: workspaceId,
			};
		}
		return singleWorkspaceSelection(workspaceId, projectId);
	}

	const rangeStart = Math.min(anchorIndex, workspaceIndex);
	const rangeEnd = Math.max(anchorIndex, workspaceIndex);
	const rangeIds = orderedWorkspaceIds.slice(rangeStart, rangeEnd + 1);
	const selectedIds =
		mode === "add-range"
			? new Set([...state.selectedIds, ...rangeIds])
			: new Set(rangeIds);

	return {
		projectId,
		selectedIds: selectedIdsInVisualOrder(
			orderedWorkspaceIds,
			selectedIds,
			mode === "add-range" ? state.selectedIds : [],
		),
		anchorId: state.anchorId,
	};
}

export function workspaceSelectionModeFromModifiers({
	ctrlKey,
	metaKey,
	shiftKey,
}: {
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
}): WorkspaceSelectionMode | null {
	const additiveModifier = ctrlKey || metaKey;
	if (shiftKey) return additiveModifier ? "add-range" : "range";
	return additiveModifier ? "toggle" : null;
}

export function shouldClearWorkspaceSelectionOnEscape({
	key,
	defaultPrevented,
	fromTransientSurface,
}: {
	key: string;
	defaultPrevented: boolean;
	fromTransientSurface: boolean;
}): boolean {
	return key === "Escape" && !defaultPrevented && !fromTransientSurface;
}
