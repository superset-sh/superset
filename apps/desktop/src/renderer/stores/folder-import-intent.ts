import { create } from "zustand";

// Palette commands run outside React, but the folder-import flow is a hook
// (dialogs, host service, react-query). This intent store bridges the two:
// commands call request(), FolderImportMount runs the flow.
interface FolderImportIntentState {
	tick: number;
	request: () => void;
}

export const useFolderImportIntent = create<FolderImportIntentState>(
	(set, get) => ({
		tick: 0,
		request: () => set({ tick: get().tick + 1 }),
	}),
);
