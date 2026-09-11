import type { CommentAnchor, FrameRect } from "../page-comments-runtime";

export interface PageCommentUser {
	id: string;
	name: string;
	image: string | null;
}

export interface PageComment {
	id: string;
	authorName: string;
	authorImage: string | null;
	authorKind: "human" | "agent";
	authorUserId: string | null;
	body: string;
	createdAt: number;
}

export type CommentIntent = "delete" | "approve";

export interface CommentThread {
	id: string;
	anchor: CommentAnchor;
	intent?: CommentIntent | null;
	comments: PageComment[];
	resolved: boolean;
	version: number;
	createdByUserId: string | null;
}

export interface CommentDraft {
	anchor: CommentAnchor;
	rect: FrameRect;
	body?: string;
}

export interface CreateThreadInput {
	anchor: CommentAnchor;
	anchorText: string;
	body: string;
	intent?: CommentIntent | null;
}

export interface CommentStore {
	threads: CommentThread[];
	isLoading: boolean;
	createThread: (input: CreateThreadInput) => Promise<void>;
	addReply: (threadId: string, body: string) => Promise<void>;
	editComment: (
		threadId: string,
		commentId: string,
		body: string,
	) => Promise<void>;
	setResolved: (threadId: string, resolved: boolean) => Promise<void>;
	deleteThread: (threadId: string) => Promise<void>;
}
