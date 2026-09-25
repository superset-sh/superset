import type { CommentAnchor } from "@superset/shared/page-comments-runtime";
import { create } from "zustand";

interface PageCommentStore {
	pageId: string | null;
	version: number | null;
	anchor: CommentAnchor | null;
	focusThreadId: string | null;
	setPick: (pick: {
		pageId: string;
		version: number;
		anchor: CommentAnchor;
	}) => void;
	setFocusThreadId: (threadId: string | null) => void;
	clear: () => void;
}

export const usePageCommentStore = create<PageCommentStore>()((set) => ({
	pageId: null,
	version: null,
	anchor: null,
	focusThreadId: null,
	setPick: ({ pageId, version, anchor }) =>
		set({ pageId, version, anchor, focusThreadId: null }),
	setFocusThreadId: (focusThreadId) => set({ focusThreadId }),
	clear: () =>
		set({ pageId: null, version: null, anchor: null, focusThreadId: null }),
}));
