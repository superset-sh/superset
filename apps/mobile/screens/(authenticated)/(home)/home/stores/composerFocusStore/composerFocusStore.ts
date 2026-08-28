import { create } from "zustand";

interface ComposerFocusStore {
	/** Bumped when something outside the composer wants it focused. */
	focusNonce: number;
	requestFocus: () => void;
}

export const useComposerFocusStore = create<ComposerFocusStore>()((set) => ({
	focusNonce: 0,
	requestFocus: () => set((state) => ({ focusNonce: state.focusNonce + 1 })),
}));
