import { create } from "zustand";

interface PageCommentStore {
	focusThreadId: string | null;
	setFocusThreadId: (threadId: string | null) => void;
}

export const usePageCommentStore = create<PageCommentStore>()((set) => ({
	focusThreadId: null,
	setFocusThreadId: (focusThreadId) => set({ focusThreadId }),
}));
