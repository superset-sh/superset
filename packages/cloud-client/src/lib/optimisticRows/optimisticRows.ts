import {
	type CommentIntent,
	optimisticId,
	type PageCommentUser,
} from "@superset/shared/page-comments";
import type {
	CreateThreadArgs,
	ServerComment,
	ServerThread,
} from "../../types";

export function optimisticComment({
	body,
	user,
}: {
	body: string;
	user: PageCommentUser;
}): ServerComment {
	return {
		id: optimisticId(),
		body,
		authorKind: "human",
		authorUserId: user.id,
		authorName: user.name,
		authorImage: user.image,
		createdAt: new Date(),
	};
}

export function optimisticThread({
	input,
	user,
	version,
}: {
	input: {
		anchor?: CreateThreadArgs["anchor"];
		anchorText?: string | null;
		body: string;
		intent?: CommentIntent | null;
	};
	user: PageCommentUser;
	version: number;
}): ServerThread {
	return {
		id: optimisticId(),
		anchorKind: "element",
		anchor: input.anchor ?? null,
		anchorText: input.anchorText ?? null,
		intent: input.intent ?? null,
		resolved: false,
		createdAt: new Date(),
		version,
		createdByUserId: user.id,
		comments: [optimisticComment({ body: input.body, user })],
	};
}
