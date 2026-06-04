import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface PendingWorkspace {
	id: string;
	projectId: string;
	name: string;
	status: "preparing" | "generating-branch" | "creating";
}

/** Snapshot of the draft stashed before modal close, restored on failure. */
export interface StashedDraft {
	selectedProjectId: string | null;
	prompt: string;
	workspaceName: string;
	workspaceNameEdited: boolean;
	branchName: string;
	branchNameEdited: boolean;
	compareBaseBranch: string | null;
	runSetupScript: boolean;
	linkedIssues: unknown[];
	linkedPR: unknown | null;
}

interface NewWorkspaceModalState {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	pendingWorkspace: PendingWorkspace | null;
	stashedDraft: StashedDraft | null;
	openModal: (projectId?: string) => void;
	closeModal: () => void;
	setPendingWorkspace: (workspace: PendingWorkspace | null) => void;
	clearPendingWorkspace: (id: string) => void;
	setPendingWorkspaceStatus: (
		id: string,
		status: PendingWorkspace["status"],
	) => void;
	stashDraft: (draft: StashedDraft) => void;
	clearStashedDraft: () => void;
	restoreStashedDraft: () => StashedDraft | null;
}

export const useNewWorkspaceModalStore = create<NewWorkspaceModalState>()(
	devtools(
		(set, get) => ({
			isOpen: false,
			preSelectedProjectId: null,
			pendingWorkspace: null,
			stashedDraft: null,

			openModal: (projectId?: string) => {
				set({ isOpen: true, preSelectedProjectId: projectId ?? null });
			},

			closeModal: () => {
				set({ isOpen: false, preSelectedProjectId: null });
			},

			setPendingWorkspace: (workspace: PendingWorkspace | null) => {
				set({ pendingWorkspace: workspace });
			},

			clearPendingWorkspace: (id) => {
				set((state) => {
					if (state.pendingWorkspace?.id !== id) return {};
					return { pendingWorkspace: null };
				});
			},

			setPendingWorkspaceStatus: (id, status) => {
				set((state) => {
					if (state.pendingWorkspace?.id !== id) return {};
					return {
						pendingWorkspace: { ...state.pendingWorkspace, status },
					};
				});
			},

			stashDraft: (draft: StashedDraft) => {
				set({ stashedDraft: draft });
			},

			clearStashedDraft: () => {
				set({ stashedDraft: null });
			},

			/** Pops the stash: returns it and clears. Also reopens the modal. */
			restoreStashedDraft: () => {
				const stashed = get().stashedDraft;
				if (stashed) {
					set({
						stashedDraft: null,
						isOpen: true,
						preSelectedProjectId: stashed.selectedProjectId,
					});
				}
				return stashed;
			},
		}),
		{ name: "NewWorkspaceModalStore" },
	),
);

export const useNewWorkspaceModalOpen = () =>
	useNewWorkspaceModalStore((state) => state.isOpen);
export const useOpenNewWorkspaceModal = () =>
	useNewWorkspaceModalStore((state) => state.openModal);
export const useCloseNewWorkspaceModal = () =>
	useNewWorkspaceModalStore((state) => state.closeModal);
export const usePreSelectedProjectId = () =>
	useNewWorkspaceModalStore((state) => state.preSelectedProjectId);
export const usePendingWorkspace = () =>
	useNewWorkspaceModalStore((state) => state.pendingWorkspace);
export const useSetPendingWorkspace = () =>
	useNewWorkspaceModalStore((state) => state.setPendingWorkspace);
export const useClearPendingWorkspace = () =>
	useNewWorkspaceModalStore((state) => state.clearPendingWorkspace);
export const useSetPendingWorkspaceStatus = () =>
	useNewWorkspaceModalStore((state) => state.setPendingWorkspaceStatus);
export const useStashDraft = () =>
	useNewWorkspaceModalStore((state) => state.stashDraft);
export const useClearStashedDraft = () =>
	useNewWorkspaceModalStore((state) => state.clearStashedDraft);
export const useRestoreStashedDraft = () =>
	useNewWorkspaceModalStore((state) => state.restoreStashedDraft);
