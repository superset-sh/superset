import type { PageComment } from "../../providers/CommentProvider";

export const AGENT_DISPLAY_NAME = "Agent";

export interface CommentAuthor {
	name: string;
	image: string | null;
	isAgent: boolean;
}

export function commentAuthor(
	comment: Pick<PageComment, "authorKind" | "authorName" | "authorImage">,
): CommentAuthor {
	if (comment.authorKind === "agent") {
		return { name: AGENT_DISPLAY_NAME, image: null, isAgent: true };
	}
	return {
		name: comment.authorName,
		image: comment.authorImage,
		isAgent: false,
	};
}
