import { create } from "zustand";

interface WorkspaceSelectionState {
	selectedIds: Set<string>;
	selectedProjectId: string | null;
	lastClickedId: string | null;
	select: (id: string, projectId: string) => void;
	toggle: (id: string, projectId: string) => void;
	selectRange: (ids: string[], projectId: string) => void;
	clearSelection: () => void;
}

export const useWorkspaceSelectionStore = create<WorkspaceSelectionState>(
	(set) => ({
		selectedIds: new Set(),
		selectedProjectId: null,
		lastClickedId: null,

		select: (id, projectId) =>
			set({
				selectedIds: new Set([id]),
				selectedProjectId: projectId,
				lastClickedId: id,
			}),

		toggle: (id, projectId) =>
			set((state) => {
				if (
					state.selectedProjectId !== null &&
					state.selectedProjectId !== projectId
				) {
					return {
						selectedIds: new Set([id]),
						selectedProjectId: projectId,
						lastClickedId: id,
					};
				}
				const next = new Set(state.selectedIds);
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				return {
					selectedIds: next,
					selectedProjectId: next.size > 0 ? projectId : null,
					lastClickedId: next.size > 0 ? id : null,
				};
			}),

		selectRange: (ids, projectId) =>
			set({
				selectedIds: new Set(ids),
				selectedProjectId: projectId,
				lastClickedId: ids[ids.length - 1] ?? null,
			}),

		clearSelection: () =>
			set({
				selectedIds: new Set(),
				selectedProjectId: null,
				lastClickedId: null,
			}),
	}),
);
