import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface DiffComment {
	id: string;
	filePath: string;
	lineNumber: number;
	side: "original" | "modified";
	text: string;
	author: string;
	createdAt: number;
}

interface DiffCommentsState {
	/** Comments keyed by worktreePath, then by filePath */
	comments: Record<string, Record<string, DiffComment[]>>;

	addComment: (params: {
		worktreePath: string;
		filePath: string;
		lineNumber: number;
		side: "original" | "modified";
		text: string;
		author?: string;
	}) => void;

	deleteComment: (params: {
		worktreePath: string;
		filePath: string;
		commentId: string;
	}) => void;

	editComment: (params: {
		worktreePath: string;
		filePath: string;
		commentId: string;
		text: string;
	}) => void;

	getFileComments: (worktreePath: string, filePath: string) => DiffComment[];

	getFileCommentCount: (worktreePath: string, filePath: string) => number;

	clearFileComments: (worktreePath: string, filePath: string) => void;

	clearAllComments: (worktreePath: string) => void;
}

export const useDiffCommentsStore = create<DiffCommentsState>()(
	devtools(
		persist(
			(set, get) => ({
				comments: {},

				addComment: ({
					worktreePath,
					filePath,
					lineNumber,
					side,
					text,
					author,
				}) => {
					const { comments } = get();
					const workspaceComments = comments[worktreePath] ?? {};
					const fileComments = workspaceComments[filePath] ?? [];

					const newComment: DiffComment = {
						id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
						filePath,
						lineNumber,
						side,
						text,
						author: author ?? "You",
						createdAt: Date.now(),
					};

					set({
						comments: {
							...comments,
							[worktreePath]: {
								...workspaceComments,
								[filePath]: [...fileComments, newComment],
							},
						},
					});
				},

				deleteComment: ({ worktreePath, filePath, commentId }) => {
					const { comments } = get();
					const workspaceComments = comments[worktreePath] ?? {};
					const fileComments = workspaceComments[filePath] ?? [];

					set({
						comments: {
							...comments,
							[worktreePath]: {
								...workspaceComments,
								[filePath]: fileComments.filter((c) => c.id !== commentId),
							},
						},
					});
				},

				editComment: ({ worktreePath, filePath, commentId, text }) => {
					const { comments } = get();
					const workspaceComments = comments[worktreePath] ?? {};
					const fileComments = workspaceComments[filePath] ?? [];

					set({
						comments: {
							...comments,
							[worktreePath]: {
								...workspaceComments,
								[filePath]: fileComments.map((c) =>
									c.id === commentId ? { ...c, text } : c,
								),
							},
						},
					});
				},

				getFileComments: (worktreePath, filePath) => {
					const workspaceComments = get().comments[worktreePath] ?? {};
					return workspaceComments[filePath] ?? [];
				},

				getFileCommentCount: (worktreePath, filePath) => {
					const workspaceComments = get().comments[worktreePath] ?? {};
					return (workspaceComments[filePath] ?? []).length;
				},

				clearFileComments: (worktreePath, filePath) => {
					const { comments } = get();
					const workspaceComments = comments[worktreePath] ?? {};
					const { [filePath]: _, ...rest } = workspaceComments;

					set({
						comments: {
							...comments,
							[worktreePath]: rest,
						},
					});
				},

				clearAllComments: (worktreePath) => {
					const { comments } = get();
					const { [worktreePath]: _, ...rest } = comments;
					set({ comments: rest });
				},
			}),
			{
				name: "diff-comments-store",
				version: 1,
			},
		),
		{ name: "DiffCommentsStore" },
	),
);
