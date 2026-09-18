import type { CommentAnchor, FrameRect } from "../page-comments-runtime";

export interface PageCommentUser {
	id: string;
	name: string;
	image: string | null;
}

/**
 * An image on a comment as a reader sees it. `url` is short-lived — the
 * server signs it per response — so it is displayed, never stored.
 */
export interface CommentImage {
	fileId: string;
	name: string;
	contentType: string;
	url: string;
}

export interface PageComment {
	id: string;
	authorName: string;
	authorImage: string | null;
	authorKind: "human" | "agent";
	authorUserId: string | null;
	agentLabel: string | null;
	body: string;
	attachments: CommentImage[];
	createdAt: number;
}

export type CommentIntent = "delete" | "approve";

export interface CommentThread {
	id: string;
	anchor: CommentAnchor | null;
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
	attachments?: ComposedImage[];
}

/**
 * An image already uploaded and waiting to be sent with a comment.
 * `previewUrl` is client-local (an object URL) and renders the optimistic
 * row until the server answers with a served URL.
 */
export interface ComposedImage {
	fileId: string;
	name: string;
	contentType: string;
	previewUrl: string;
}

/**
 * Bytes on their way to `uploadImage`, shaped so web (`File`) and native
 * (a picker result) both fit without either platform's file type.
 */
export interface CommentImageUpload {
	name: string;
	contentType: string;
	bytes: ArrayBuffer;
}

export interface CreateThreadInput {
	anchor?: CommentAnchor;
	anchorText?: string;
	body: string;
	intent?: CommentIntent | null;
	attachments?: ComposedImage[];
}

export interface CommentStore {
	threads: CommentThread[];
	isLoading: boolean;
	createThread: (input: CreateThreadInput) => Promise<void>;
	addReply: (
		threadId: string,
		body: string,
		attachments?: ComposedImage[],
	) => Promise<void>;
	editComment: (
		threadId: string,
		commentId: string,
		body: string,
	) => Promise<void>;
	setResolved: (threadId: string, resolved: boolean) => Promise<void>;
	deleteThread: (threadId: string) => Promise<void>;
	uploadImage: (file: CommentImageUpload) => Promise<{ fileId: string }>;
}
