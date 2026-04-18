import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Minimum shape needed to render the Pin & set up modal. Kept local so the
 * store doesn't depend on the v2-workspaces route types.
 */
export interface PinAndSetupTarget {
	id: string;
	name: string;
	githubOwner: string | null;
	githubRepoName: string | null;
}

type ActiveModal =
	| { kind: "none" }
	| { kind: "new-project" }
	| { kind: "pin-and-setup"; target: PinAndSetupTarget };

interface AddRepositoryModalState {
	active: ActiveModal;
	// Monotonically increasing counter; bumping it signals the host
	// component to run the folder-first import flow (which is owned by a
	// useFolderFirstImport hook — hooks can't live in a zustand store, so we
	// use a trigger pulse instead).
	folderImportTrigger: number;
	openNewProject: () => void;
	triggerFolderImport: () => void;
	openPinAndSetup: (target: PinAndSetupTarget) => void;
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
			openPinAndSetup: (target) =>
				set({ active: { kind: "pin-and-setup", target } }),
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
export const useOpenPinAndSetupModal = () =>
	useAddRepositoryModalStore((state) => state.openPinAndSetup);
export const useCloseAddRepositoryModal = () =>
	useAddRepositoryModalStore((state) => state.close);
