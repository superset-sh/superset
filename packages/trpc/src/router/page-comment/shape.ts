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
	agentLabel: string | null;
	createdAt: Date;
}

/**
 * An agent writes under the credential of the person whose session it is, so
 * author_user_id — and every name joined from it — is that person. The agent's
 * own identity is only in the session id: `mcp:<label>` for MCP, which the
 * server sets, and whatever a CLI agent claimed otherwise.
 */
export function agentLabelFor(
	comment: Pick<SelectPageComment, "authorKind" | "agentSessionId">,
): string | null {
	if (comment.authorKind !== "agent") return null;
	const session = comment.agentSessionId ?? "";
	if (!session.startsWith("mcp:")) return "Agent";
	const label = session.slice("mcp:".length).trim();
	if (!label || label === "unknown") return "Agent";
	return label.charAt(0).toUpperCase() + label.slice(1);
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
		agentLabel: agentLabelFor(comment),
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
