import { create } from "zustand";

export interface DeleteWorkspaceTarget {
	workspaceId: string;
	workspaceName: string;
}

interface DeleteWorkspaceIntentState {
	target: DeleteWorkspaceTarget | null;
	request: (target: DeleteWorkspaceTarget) => void;
	close: () => void;
}

export const useDeleteWorkspaceIntent = create<DeleteWorkspaceIntentState>(
	(set) => ({
		target: null,
		request: (target) => set({ target }),
		close: () => set({ target: null }),
	}),
);
