"use client";

import type { RouterOutputs } from "@superset/trpc";
import type { CommentStore, CommentThread } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTRPC } from "@/trpc/react";

type ServerThread = RouterOutputs["pageComment"]["list"][number];

function toThreads(rows: ServerThread[]): CommentThread[] {
	return rows.flatMap((row) =>
		row.anchor
			? [
					{
						id: row.id,
						anchor: {
							path: row.anchor.path,
							tag: row.anchor.tag,
							text: row.anchorText ?? "",
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

export function usePageCommentStore({
	pageId,
	version,
}: {
	pageId: string;
	version: number;
}): CommentStore {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const listOptions = trpc.pageComment.list.queryOptions({ pageId, version });
	const list = useQuery(listOptions);

	const invalidate = useCallback(
		() => queryClient.invalidateQueries({ queryKey: listOptions.queryKey }),
		[queryClient, listOptions.queryKey],
	);

	const onSettled = useMemo(
		() => ({
			onSuccess: invalidate,
			onError: (error: { message: string }) => toast.error(error.message),
		}),
		[invalidate],
	);

	const create = useMutation(
		trpc.pageComment.create.mutationOptions(onSettled),
	);
	const reply = useMutation(trpc.pageComment.reply.mutationOptions(onSettled));
	const edit = useMutation(trpc.pageComment.edit.mutationOptions(onSettled));
	const resolve = useMutation(
		trpc.pageComment.resolve.mutationOptions(onSettled),
	);
	const remove = useMutation(
		trpc.pageComment.delete.mutationOptions(onSettled),
	);

	const threads = useMemo(() => toThreads(list.data ?? []), [list.data]);

	return useMemo<CommentStore>(
		() => ({
			threads,
			isLoading: list.isPending,
			createThread: async ({ anchor, anchorText, body }) => {
				await create.mutateAsync({
					pageId,
					version,
					anchorKind: "element",
					anchor: { path: anchor.path, tag: anchor.tag },
					anchorText: anchorText.slice(0, 500) || null,
					body,
				});
			},
			addReply: async (threadId, body) => {
				await reply.mutateAsync({ threadId, body });
			},
			editComment: async (_threadId, commentId, body) => {
				await edit.mutateAsync({ commentId, body });
			},
			setResolved: async (threadId, resolved) => {
				await resolve.mutateAsync({ threadId, resolved });
			},
			deleteThread: async (threadId) => {
				await remove.mutateAsync({ threadId });
			},
		}),
		[
			threads,
			list.isPending,
			create,
			reply,
			edit,
			resolve,
			remove,
			pageId,
			version,
		],
	);
}
