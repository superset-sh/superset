import { create } from "zustand";

interface SelectedRepoStore {
	/** Selected checkout folder by workspace id. */
	folders: Record<string, string>;
	selectFolder: (workspaceId: string, folder: string) => void;
}

/**
 * Deliberately not persisted: workspace-keyed with unbounded cardinality,
 * which `apps/desktop/AGENTS.md` bars from localStorage, and there is no
 * host-side UI-state store to hold it instead (as `rowlessSidebarTabStore`).
 */
export const useSelectedRepoStore = create<SelectedRepoStore>()((set) => ({
	folders: {},
	selectFolder: (workspaceId, folder) =>
		set((state) => ({ folders: { ...state.folders, [workspaceId]: folder } })),
}));
