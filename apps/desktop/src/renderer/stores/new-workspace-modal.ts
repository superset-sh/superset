import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface PendingWorkspace {
	id: string;
	projectId: string;
	name: string;
	status: "preparing" | "generating-branch" | "creating";
}

interface NewWorkspaceModalState {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	/** Open with "No project" (session) preselected. */
	preSelectedSession: boolean;
	pendingWorkspace: PendingWorkspace | null;
	openModal: (projectId?: string) => void;
	openSessionModal: () => void;
	closeModal: () => void;
	setPendingWorkspace: (workspace: PendingWorkspace | null) => void;
	clearPendingWorkspace: (id: string) => void;
	setPendingWorkspaceStatus: (
		id: string,
		status: PendingWorkspace["status"],
	) => void;
}

export const useNewWorkspaceModalStore = create<NewWorkspaceModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			preSelectedProjectId: null,
			preSelectedSession: false,
			pendingWorkspace: null,

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

			closeModal: () => {
				set({
					isOpen: false,
					preSelectedProjectId: null,
					preSelectedSession: false,
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
