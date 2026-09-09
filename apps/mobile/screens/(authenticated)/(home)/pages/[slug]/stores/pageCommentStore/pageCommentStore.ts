import type { CommentAnchor } from "@superset/shared/page-comments-runtime";
import { create } from "zustand";

/**
 * The pick a sheet route is about to act on. Transient and deliberately not
 * persisted: it belongs to one selection in one page, and a pick that outlived
 * the screen would post an anchor against whatever page opened next.
 */
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
