import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ActiveModal = { kind: "none" } | { kind: "new-project" };

interface AddRepositoryModalState {
	active: ActiveModal;
	// Monotonically increasing counter; bumping it signals the host
	// component to run the folder-first import flow (which is owned by a
	// useFolderFirstImport hook — hooks can't live in a zustand store, so we
	// use a trigger pulse instead).
	folderImportTrigger: number;
	openNewProject: () => void;
	triggerFolderImport: () => void;
	close: () => void;
}

export const useAddRepositoryModalStore = create<AddRepositoryModalState>()(
	devtools(
		(set) => ({
			active: { kind: "none" },
			folderImportTrigger: 0,
			openNewProject: () => set({ active: { kind: "new-project" } }),
			triggerFolderImport: () =>
				set((state) => ({
					folderImportTrigger: state.folderImportTrigger + 1,
				})),
			close: () => set({ active: { kind: "none" } }),
		}),
		{ name: "add-repository-modal" },
	),
);

export const useAddRepositoryModalActive = () =>
	useAddRepositoryModalStore((state) => state.active);
export const useFolderImportTrigger = () =>
	useAddRepositoryModalStore((state) => state.folderImportTrigger);
export const useOpenNewProjectModal = () =>
	useAddRepositoryModalStore((state) => state.openNewProject);
export const useTriggerFolderImport = () =>
	useAddRepositoryModalStore((state) => state.triggerFolderImport);
export const useCloseAddRepositoryModal = () =>
	useAddRepositoryModalStore((state) => state.close);
