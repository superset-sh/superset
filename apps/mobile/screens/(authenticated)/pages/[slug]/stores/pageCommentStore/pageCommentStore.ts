import type { CommentAnchor } from "@superset/shared/page-comments-runtime";
import { create } from "zustand";

interface PageCommentStore {
	pageId: string | null;
	version: number | null;
	anchor: CommentAnchor | null;
	threadId: string | null;
	setPick: (pick: {
		pageId: string;
		version: number;
		anchor: CommentAnchor;
	}) => void;
	setThreadId: (threadId: string | null) => void;
	clear: () => void;
}

export const usePageCommentStore = create<PageCommentStore>()((set) => ({
	pageId: null,
	version: null,
	anchor: null,
	threadId: null,
	setPick: ({ pageId, version, anchor }) =>
		set({ pageId, version, anchor, threadId: null }),
	setThreadId: (threadId) => set({ threadId }),
	clear: () =>
		set({ pageId: null, version: null, anchor: null, threadId: null }),
}));
