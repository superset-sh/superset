import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

interface PendingWorkspace {
	id: string;
	projectId: string;
	name: string;
	status: "preparing" | "generating-branch" | "creating";
}

/** Snapshot of the draft stashed before modal close, restored on failure. */
export interface StashedDraft {
	selectedProjectId: string | null;
	/** True when the stashed draft had "No project" (session) selected. */
	isSession: boolean;
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
	/** Open with "No project" (session) preselected. */
	preSelectedSession: boolean;
	pendingWorkspace: PendingWorkspace | null;
	stashedDraft: StashedDraft | null;
	openModal: (projectId?: string) => void;
	openSessionModal: () => void;
	closeModal: (options?: { resetDraft?: boolean }) => void;
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
			preSelectedSession: false,
			pendingWorkspace: null,
			stashedDraft: null,

			openModal: (projectId?: string) => {
				set({
					isOpen: true,
					preSelectedProjectId: projectId ?? null,
					preSelectedSession: false,
				});
			},

			openSessionModal: () => {
				set({
					isOpen: true,
					preSelectedProjectId: null,
					preSelectedSession: true,
				});
			},

			closeModal: (options?: { resetDraft?: boolean }) => {
				set({
					isOpen: false,
					preSelectedProjectId: null,
					preSelectedSession: false,
				});
				// #5372: a seeded draft (e.g. the Setup-scripts prompt written
				// by V2SetupScriptCard) must not survive dismissing the modal —
				// otherwise the next "New Workspace" opens pre-filled with a
				// prompt the user never asked for. Every seed path calls
				// resetDraft() before updateDraft(), so resetting here is safe
				// and makes the dismiss the single cleanup point.
				//
				// The full-page handoff (DashboardNewWorkspaceModal test arm)
				// closes the store modal BEFORE navigating to /new-workspace,
				// where the destination consumes the seeded draft — so it opts
				// out with { resetDraft: false } (greptile/cubic P1).
				if (options?.resetDraft !== false) {
					useNewWorkspaceDraftStore.getState().resetDraft();
				}
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
						preSelectedSession: stashed.isSession,
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
export const useOpenNewSessionModal = () =>
	useNewWorkspaceModalStore((state) => state.openSessionModal);
export const usePreSelectedSession = () =>
	useNewWorkspaceModalStore((state) => state.preSelectedSession);
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
