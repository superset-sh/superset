import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface NewWorkspaceModalState {
	isOpen: boolean;
	openModal: () => void;
	closeModal: () => void;
}

export const useNewWorkspaceModalStore = create<NewWorkspaceModalState>()(
	devtools(
		(set) => ({
			isOpen: false,

			openModal: () => {
				set({ isOpen: true });
			},

			closeModal: () => {
				set({ isOpen: false });
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
