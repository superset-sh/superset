import { create } from "zustand";

interface V2WorkspaceNavigationState {
	pendingWorkspaceId: string | null;
	setPendingWorkspaceId: (workspaceId: string) => void;
	clearPendingWorkspaceId: (workspaceId: string) => void;
}

export const useV2WorkspaceNavigationStore = create<V2WorkspaceNavigationState>(
	(set) => ({
		pendingWorkspaceId: null,
		setPendingWorkspaceId: (workspaceId) =>
			set({ pendingWorkspaceId: workspaceId }),
		clearPendingWorkspaceId: (workspaceId) =>
			set((state) =>
				state.pendingWorkspaceId === workspaceId
					? { pendingWorkspaceId: null }
					: state,
			),
	}),
);

export function setPendingV2WorkspaceNavigation(workspaceId: string): void {
	useV2WorkspaceNavigationStore.getState().setPendingWorkspaceId(workspaceId);
}

export function clearPendingV2WorkspaceNavigation(workspaceId: string): void {
	useV2WorkspaceNavigationStore.getState().clearPendingWorkspaceId(workspaceId);
}
