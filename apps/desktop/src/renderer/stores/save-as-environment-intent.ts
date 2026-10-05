import { create } from "zustand";

/** Drives the one Save-as-environment dialog, which every entry point opens. */
interface SaveAsEnvironmentIntentState {
	workspaceId: string | null;
	request: (workspaceId: string) => void;
	close: () => void;
}

export const useSaveAsEnvironmentIntent = create<SaveAsEnvironmentIntentState>(
	(set) => ({
		workspaceId: null,
		request: (workspaceId) => set({ workspaceId }),
		close: () => set({ workspaceId: null }),
	}),
);
