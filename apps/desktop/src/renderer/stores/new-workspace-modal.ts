import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface PendingWorkspace {
	projectId: string;
	name: string;
	isGeneratingBranchName: boolean;
}

interface NewWorkspaceModalState {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	pendingWorkspace: PendingWorkspace | null;
	openModal: (projectId?: string) => void;
	closeModal: () => void;
	setPendingWorkspace: (workspace: PendingWorkspace | null) => void;
	setIsGeneratingBranchName: (isGenerating: boolean) => void;
}

export const useNewWorkspaceModalStore = create<NewWorkspaceModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			preSelectedProjectId: null,
			pendingWorkspace: null,

			openModal: (projectId?: string) => {
				set({ isOpen: true, preSelectedProjectId: projectId ?? null });
			},

			closeModal: () => {
				set({ isOpen: false, preSelectedProjectId: null });
			},

			setPendingWorkspace: (workspace: PendingWorkspace | null) => {
				set({ pendingWorkspace: workspace });
			},

			setIsGeneratingBranchName: (isGenerating: boolean) => {
				set((state) =>
					state.pendingWorkspace
						? {
								pendingWorkspace: {
									...state.pendingWorkspace,
									isGeneratingBranchName: isGenerating,
								},
							}
						: {},
				);
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
export const useSetIsGeneratingBranchName = () =>
	useNewWorkspaceModalStore((state) => state.setIsGeneratingBranchName);
