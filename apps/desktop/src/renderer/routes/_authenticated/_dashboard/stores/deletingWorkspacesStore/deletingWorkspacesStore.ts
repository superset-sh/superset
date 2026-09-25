import { create } from "zustand";

/**
 * Workspace ids with a destroy in flight. The archive commit tombstones the
 * row almost immediately, but there's still a window before the broadcast
 * lands (plus the reappear-on-failure case) — navigation targeting and
 * keyboard shortcuts must not send the user into a workspace that is about
 * to vanish. Module-scope store, not a provider: it is written imperatively
 * by the destroy flows and read wherever a target is picked.
 */
interface DeletingWorkspacesState {
	deletingIds: ReadonlySet<string>;
	markDeleting: (workspaceId: string) => void;
	clearDeleting: (workspaceId: string) => void;
}

export const useDeletingWorkspacesStore = create<DeletingWorkspacesState>()(
	(set) => ({
		deletingIds: new Set<string>(),
		markDeleting: (workspaceId) =>
			set((state) => {
				const next = new Set(state.deletingIds);
				next.add(workspaceId);
				return { deletingIds: next };
			}),
		clearDeleting: (workspaceId) =>
			set((state) => {
				const next = new Set(state.deletingIds);
				next.delete(workspaceId);
				return { deletingIds: next };
			}),
	}),
);
