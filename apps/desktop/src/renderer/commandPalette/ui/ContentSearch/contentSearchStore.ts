import { create } from "zustand";

interface ContentSearchTarget {
	workspaceId: string;
}

interface ContentSearchState {
	open: boolean;
	target: ContentSearchTarget | null;
	openFor: (target: ContentSearchTarget) => void;
	close: () => void;
}

export const useContentSearchStore = create<ContentSearchState>((set) => ({
	open: false,
	target: null,
	openFor: (target) => set({ open: true, target }),
	close: () => set({ open: false }),
}));
