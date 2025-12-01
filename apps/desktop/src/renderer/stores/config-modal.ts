import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface ConfigModalState {
	isOpen: boolean;
	projectId: string | null;
	openModal: (projectId: string) => void;
	closeModal: () => void;
}

export const useConfigModalStore = create<ConfigModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			projectId: null,

			openModal: (projectId) => {
				set({ isOpen: true, projectId });
			},

			closeModal: () => {
				set({ isOpen: false, projectId: null });
			},
		}),
		{ name: "ConfigModalStore" },
	),
);

// Convenience hooks
export const useConfigModalOpen = () =>
	useConfigModalStore((state) => state.isOpen);
export const useConfigModalProjectId = () =>
	useConfigModalStore((state) => state.projectId);
export const useOpenConfigModal = () =>
	useConfigModalStore((state) => state.openModal);
export const useCloseConfigModal = () =>
	useConfigModalStore((state) => state.closeModal);
