import type { CommentThread } from "@superset/shared/page-comments";
import type { ServerThread } from "../../types";

export function toThreads(rows: ServerThread[]): CommentThread[] {
	return rows.map((row) => ({
		id: row.id,
		anchor: row.anchor
			? {
					path: row.anchor.path,
					tag: row.anchor.tag,
					text: row.anchorText ?? "",
					offsetX: row.anchor.offsetX,
					offsetY: row.anchor.offsetY,
				}
			: null,
		intent: row.intent,
		resolved: row.resolved,
		version: row.version,
		createdByUserId: row.createdByUserId,
		comments: row.comments.map((comment) => ({
			id: comment.id,
			body: comment.body,
			authorName: comment.authorName,
			authorImage: comment.authorImage,
			authorKind: comment.authorKind,
			authorUserId: comment.authorUserId,
			agentLabel: comment.agentLabel,
			// `?? []` outlives the type: an API a release behind this client
			// sends comments without the field.
			attachments: (comment.attachments ?? []).map((attachment) => ({
				fileId: attachment.fileId,
				name: attachment.name,
				contentType: attachment.contentType,
				url: attachment.url,
			})),
			createdAt: comment.createdAt.getTime(),
		})),
	}));
}
