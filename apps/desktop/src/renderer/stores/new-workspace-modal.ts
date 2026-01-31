import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface NewWorkspaceModalState {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	openModal: (projectId?: string) => void;
	closeModal: () => void;
}

export const useNewWorkspaceModalStore = create<NewWorkspaceModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			preSelectedProjectId: null,

			openModal: (projectId?: string) => {
				set({ isOpen: true, preSelectedProjectId: projectId ?? null });
			},

			closeModal: () => {
				set({ isOpen: false, preSelectedProjectId: null });
			},
		}),
		{ name: "NewWorkspaceModalStore" },
	),
);

// Convenience hooks
export const useNewWorkspaceModalOpen = () =>
	useNewWorkspaceModalStore((state) => state.isOpen);
export const useOpenNewWorkspaceModal = () =>
	useNewWorkspaceModalStore((state) => state.openModal);
export const useCloseNewWorkspaceModal = () =>
	useNewWorkspaceModalStore((state) => state.closeModal);
export const usePreSelectedProjectId = () =>
	useNewWorkspaceModalStore((state) => state.preSelectedProjectId);
