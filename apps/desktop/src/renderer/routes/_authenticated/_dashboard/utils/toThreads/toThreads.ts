import type { RouterOutputs } from "@superset/trpc";
import type { CommentThread } from "@superset/ui/page-comments";

type ServerThread = RouterOutputs["pageComment"]["list"][number];

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
						resolved: row.resolved,
						comments: row.comments.map((comment) => ({
							id: comment.id,
							body: comment.body,
							authorName: comment.authorName,
							authorImage: comment.authorImage,
							createdAt: comment.createdAt.getTime(),
						})),
					},
				]
			: [],
	);
}
