import { create } from "zustand";
import type { DiffToken } from "../../files-changed/utils/computeFileDiff";

export interface CommentAnchor {
	workspaceId: string;
	path: string;
	side: "old" | "new";
	/** 0 = file-level comment. */
	line: number;
	lineText: string;
	lineType: "add" | "del" | "context" | "file";
	tokens?: DiffToken[];
	editingDraftId?: string;
	initialBody?: string;
}

interface CommentComposerStore {
	anchor: CommentAnchor | null;
	openComposer: (anchor: CommentAnchor) => void;
	closeComposer: () => void;
}

export const useCommentComposerStore = create<CommentComposerStore>()(
	(set) => ({
		anchor: null,
		openComposer: (anchor) => set({ anchor }),
		closeComposer: () => set({ anchor: null }),
	}),
);
