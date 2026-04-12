import { create } from "zustand";

interface AddRepositoryDialogState {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	openDialog: (projectId?: string) => void;
	closeDialog: () => void;
}

export const useAddRepositoryDialogStore = create<AddRepositoryDialogState>()(
	(set) => ({
		isOpen: false,
		preSelectedProjectId: null,
		openDialog: (projectId?: string) =>
			set({ isOpen: true, preSelectedProjectId: projectId ?? null }),
		closeDialog: () => set({ isOpen: false, preSelectedProjectId: null }),
	}),
);

export const useAddRepositoryDialogOpen = () =>
	useAddRepositoryDialogStore((state) => state.isOpen);
export const useOpenAddRepositoryDialog = () =>
	useAddRepositoryDialogStore((state) => state.openDialog);
export const useCloseAddRepositoryDialog = () =>
	useAddRepositoryDialogStore((state) => state.closeDialog);
export const useAddRepositoryPreSelectedId = () =>
	useAddRepositoryDialogStore((state) => state.preSelectedProjectId);
