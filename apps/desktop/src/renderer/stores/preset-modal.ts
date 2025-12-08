import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface PresetModalState {
	isOpen: boolean;
	projectId: string | null;
	prefillCwd: string | null;
	openModal: (projectId: string, prefillCwd?: string) => void;
	closeModal: () => void;
}

export const usePresetModalStore = create<PresetModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			projectId: null,
			prefillCwd: null,

			openModal: (projectId, prefillCwd) => {
				set({ isOpen: true, projectId, prefillCwd: prefillCwd || null });
			},

			closeModal: () => {
				set({ isOpen: false, projectId: null, prefillCwd: null });
			},
		}),
		{ name: "PresetModalStore" },
	),
);

// Convenience hooks
export const usePresetModalOpen = () =>
	usePresetModalStore((state) => state.isOpen);
export const usePresetModalProjectId = () =>
	usePresetModalStore((state) => state.projectId);
export const usePresetModalPrefillCwd = () =>
	usePresetModalStore((state) => state.prefillCwd);
export const useOpenPresetModal = () =>
	usePresetModalStore((state) => state.openModal);
export const useClosePresetModal = () =>
	usePresetModalStore((state) => state.closeModal);
