import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface CloudWorkspaceModalState {
	isOpen: boolean;
	preSelectedRepositoryId: string | null;
	openModal: (repositoryId?: string) => void;
	closeModal: () => void;
}

export const useCloudWorkspaceModalStore = create<CloudWorkspaceModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			preSelectedRepositoryId: null,
			openModal: (repositoryId) =>
				set({
					isOpen: true,
					preSelectedRepositoryId: repositoryId ?? null,
				}),
			closeModal: () =>
				set({
					isOpen: false,
					preSelectedRepositoryId: null,
				}),
		}),
		{ name: "CloudWorkspaceModalStore" },
	),
);

// Convenience selectors
export const useCloudWorkspaceModalOpen = () =>
	useCloudWorkspaceModalStore((state) => state.isOpen);

export const useOpenCloudWorkspaceModal = () =>
	useCloudWorkspaceModalStore((state) => state.openModal);

export const useCloseCloudWorkspaceModal = () =>
	useCloudWorkspaceModalStore((state) => state.closeModal);
