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
	/**
	 * Open targeting this host instead of the last-used one. Null leaves the
	 * remembered target alone, which is what every other open does.
	 */
	preSelectedHostId: string | null;
	pendingWorkspace: PendingWorkspace | null;
	stashedDraft: StashedDraft | null;
	openModal: (projectId?: string) => void;
	openSessionModal: () => void;
	openHostModal: (hostId: string) => void;
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
			preSelectedSession: false,
			preSelectedHostId: null,
			pendingWorkspace: null,
			stashedDraft: null,

			openModal: (projectId?: string) => {
				set({
					isOpen: true,
					preSelectedProjectId: projectId ?? null,
					preSelectedSession: false,
					preSelectedHostId: null,
				});
			},

			openSessionModal: () => {
				set({
					isOpen: true,
					preSelectedProjectId: null,
					preSelectedSession: true,
					preSelectedHostId: null,
				});
			},

			/**
			 * Open aimed at one host — the Cloud section's "+", whose whole point
			 * is the target. Project selection is left to the usual default so
			 * this stays a host preference, not a second create surface.
			 */
			openHostModal: (hostId: string) => {
				set({
					isOpen: true,
					preSelectedProjectId: null,
					preSelectedSession: false,
					preSelectedHostId: hostId,
				});
			},

			closeModal: () => {
				set({
					isOpen: false,
					preSelectedProjectId: null,
					preSelectedSession: false,
					preSelectedHostId: null,
				});
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
export const useOpenNewWorkspaceModalForHost = () =>
	useNewWorkspaceModalStore((state) => state.openHostModal);
export const usePreSelectedHostId = () =>
	useNewWorkspaceModalStore((state) => state.preSelectedHostId);
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
