import { create } from "zustand";

interface QuickOpenTarget {
	workspaceId: string;
}

interface QuickOpenState {
	open: boolean;
	target: QuickOpenTarget | null;
	openFor: (target: QuickOpenTarget) => void;
	close: () => void;
}

export const useQuickOpenStore = create<QuickOpenState>((set) => ({
	open: false,
	target: null,
	openFor: (target) => set({ open: true, target }),
	close: () => set({ open: false }),
}));
