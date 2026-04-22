import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ActiveModal = { kind: "none" } | { kind: "new-project" };

interface AddRepositoryModalState {
	active: ActiveModal;
	openNewProject: () => void;
	close: () => void;
}

export const useAddRepositoryModalStore = create<AddRepositoryModalState>()(
	devtools(
		(set) => ({
			active: { kind: "none" },
			openNewProject: () => set({ active: { kind: "new-project" } }),
			close: () => set({ active: { kind: "none" } }),
		}),
		{ name: "add-repository-modal" },
	),
);

export const useAddRepositoryModalActive = () =>
	useAddRepositoryModalStore((state) => state.active);
export const useOpenNewProjectModal = () =>
	useAddRepositoryModalStore((state) => state.openNewProject);
export const useCloseAddRepositoryModal = () =>
	useAddRepositoryModalStore((state) => state.close);
