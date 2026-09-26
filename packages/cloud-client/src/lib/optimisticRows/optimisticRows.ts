import {
	type CommentIntent,
	type ComposedImage,
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
	attachments,
}: {
	body: string;
	user: PageCommentUser;
	attachments?: ComposedImage[];
}): ServerComment {
	return {
		id: optimisticId(),
		body,
		authorKind: "human",
		authorUserId: user.id,
		authorName: user.name,
		authorImage: user.image,
		agentLabel: null,
		// The local preview stands in for the served URL until the server
		// answers with the real one.
		attachments: (attachments ?? []).map((attachment) => ({
			fileId: attachment.fileId,
			name: attachment.name,
			contentType: attachment.contentType,
			url: attachment.previewUrl,
		})),
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
		attachments?: ComposedImage[];
	};
	user: PageCommentUser;
	version: number;
}): ServerThread {
	return {
		id: optimisticId(),
		anchorKind: input.anchor ? "element" : "page",
		anchor: input.anchor ?? null,
		anchorText: input.anchorText ?? null,
		intent: input.intent ?? null,
		resolved: false,
		createdAt: new Date(),
		version,
		createdByUserId: user.id,
		comments: [
			optimisticComment({
				body: input.body,
				user,
				attachments: input.attachments,
			}),
		],
	};
}
