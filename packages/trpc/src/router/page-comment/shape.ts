import type {
	SelectPageComment,
	SelectPageCommentThread,
} from "@superset/db/schema";
import type { ElementAnchor } from "./schema";

export interface CommentAuthorRow {
	name: string | null;
	image: string | null;
}

export interface ShapedComment {
	id: string;
	body: string;
	authorKind: SelectPageComment["authorKind"];
	authorUserId: string | null;
	authorName: string;
	authorImage: string | null;
	createdAt: Date;
}

export interface ShapedThread {
	id: string;
	anchorKind: SelectPageCommentThread["anchorKind"];
	intent: SelectPageCommentThread["intent"];
	anchor: ElementAnchor | null;
	anchorText: string | null;
	resolved: boolean;
	createdAt: Date;
	version: number;
	createdByUserId: string | null;
	comments: ShapedComment[];
}

export function shapeComment(
	comment: SelectPageComment,
	author: CommentAuthorRow,
): ShapedComment {
	return {
		id: comment.id,
		body: comment.body,
		authorKind: comment.authorKind,
		authorUserId: comment.authorUserId,
		authorName: author.name ?? "Unknown",
		authorImage: author.image ?? null,
		createdAt: comment.createdAt,
	};
}

export function shapeThread(
	thread: SelectPageCommentThread,
	version: number,
	comments: ShapedComment[],
): ShapedThread {
	return {
		id: thread.id,
		anchorKind: thread.anchorKind,
		intent: thread.intent,
		anchor: thread.anchor as ElementAnchor | null,
		anchorText: thread.anchorText,
		resolved: thread.resolvedAt !== null,
		createdAt: thread.createdAt,
		version,
		createdByUserId: thread.createdByUserId,
		comments,
	};
}
