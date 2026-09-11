import type { CommentThread } from "@superset/shared/page-comments";
import type { ServerThread } from "../../types";

export function toThreads(rows: ServerThread[]): CommentThread[] {
	return rows.flatMap((row) =>
		row.anchor
			? [
					{
						id: row.id,
						anchor: {
							path: row.anchor.path,
							tag: row.anchor.tag,
							text: row.anchorText ?? "",
							offsetX: row.anchor.offsetX,
							offsetY: row.anchor.offsetY,
						},
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
							createdAt: comment.createdAt.getTime(),
						})),
					},
				]
			: [],
	);
}
