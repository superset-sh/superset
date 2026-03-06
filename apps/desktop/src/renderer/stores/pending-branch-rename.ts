import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PendingBranchRename {
	expectedBranch: string;
}

interface PendingBranchRenameState {
	pendingByWorkspaceId: Record<string, PendingBranchRename>;
	markPending: (workspaceId: string, expectedBranch: string) => void;
	clearPending: (workspaceId: string) => void;
	getPending: (workspaceId: string) => PendingBranchRename | null;
}

export const usePendingBranchRenameStore = create<PendingBranchRenameState>()(
	persist(
		(set, get) => ({
			pendingByWorkspaceId: {},
			markPending: (workspaceId, expectedBranch) =>
				set((state) => ({
					pendingByWorkspaceId: {
						...state.pendingByWorkspaceId,
						[workspaceId]: { expectedBranch },
					},
				})),
			clearPending: (workspaceId) =>
				set((state) => {
					const { [workspaceId]: _removed, ...rest } =
						state.pendingByWorkspaceId;
					return { pendingByWorkspaceId: rest };
				}),
			getPending: (workspaceId) =>
				get().pendingByWorkspaceId[workspaceId] ?? null,
		}),
		{
			name: "pending-branch-rename-store",
			partialize: (state) => ({
				pendingByWorkspaceId: state.pendingByWorkspaceId,
			}),
		},
	),
);
