import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
	DiffLineType,
	DiffToken,
} from "../../files-changed/utils/computeFileDiff";

export interface DraftComment {
	id: string;
	path: string;
	side: "old" | "new";
	/** 0 = file-level comment. */
	line: number;
	lineText: string;
	/** Absent on drafts persisted before line types were stored. */
	lineType?: DiffLineType | "file";
	tokens?: DiffToken[];
	body: string;
	createdAt: number;
}

interface DraftCommentsStore {
	commentsByWorkspace: Record<string, DraftComment[]>;
	addComment: (workspaceId: string, comment: DraftComment) => void;
	updateComment: (workspaceId: string, id: string, body: string) => void;
	removeComment: (workspaceId: string, id: string) => void;
	clearWorkspace: (workspaceId: string) => void;
}

export const useDraftCommentsStore = create<DraftCommentsStore>()(
	persist(
		(set) => ({
			commentsByWorkspace: {},
			addComment: (workspaceId, comment) =>
				set((state) => ({
					commentsByWorkspace: {
						...state.commentsByWorkspace,
						[workspaceId]: [
							...(state.commentsByWorkspace[workspaceId] ?? []),
							comment,
						],
					},
				})),
			updateComment: (workspaceId, id, body) =>
				set((state) => ({
					commentsByWorkspace: {
						...state.commentsByWorkspace,
						[workspaceId]: (state.commentsByWorkspace[workspaceId] ?? []).map(
							(comment) => (comment.id === id ? { ...comment, body } : comment),
						),
					},
				})),
			removeComment: (workspaceId, id) =>
				set((state) => ({
					commentsByWorkspace: {
						...state.commentsByWorkspace,
						[workspaceId]: (
							state.commentsByWorkspace[workspaceId] ?? []
						).filter((comment) => comment.id !== id),
					},
				})),
			clearWorkspace: (workspaceId) =>
				set((state) => ({
					commentsByWorkspace: {
						...state.commentsByWorkspace,
						[workspaceId]: [],
					},
				})),
		}),
		{
			name: "draft-review-comments",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);

export const NO_COMMENTS: DraftComment[] = [];
