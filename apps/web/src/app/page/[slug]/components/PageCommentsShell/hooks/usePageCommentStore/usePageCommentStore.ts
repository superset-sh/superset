"use client";

import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import type {
	CommentStore,
	CommentThread,
	PageCommentUser,
} from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
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
							offsetX: row.anchor.offsetX,
							offsetY: row.anchor.offsetY,
						},
						resolved: row.resolved,
						version: row.version,
						comments: row.comments.map((comment) => ({
							id: comment.id,
							body: comment.body,
							authorName: comment.authorName,
							authorImage: comment.authorImage,
							authorKind: comment.authorKind,
							createdAt: comment.createdAt.getTime(),
						})),
					},
				]
			: [],
	);
}

function optimisticComment({
	body,
	user,
}: {
	body: string;
	user: PageCommentUser;
}): ServerThread["comments"][number] {
	return {
		id: `optimistic-${crypto.randomUUID()}`,
		body,
		authorKind: "human",
		authorName: user.name,
		authorImage: user.image,
		createdAt: new Date(),
	};
}

function optimisticThread({
	input,
	user,
	version,
}: {
	input: {
		anchor?: {
			path: string;
			tag: string;
			offsetX?: number;
			offsetY?: number;
		} | null;
		anchorText?: string | null;
		body: string;
	};
	user: PageCommentUser;
	version: number;
}): ServerThread {
	return {
		id: `optimistic-${crypto.randomUUID()}`,
		anchorKind: "element",
		anchor: input.anchor ?? null,
		anchorText: input.anchorText ?? null,
		resolved: false,
		createdAt: new Date(),
		version,
		comments: [optimisticComment({ body: input.body, user })],
	};
}

export function usePageCommentStore({
	pageId,
	version,
	user,
}: {
	pageId: string;
	version: number;
	user: PageCommentUser;
}): CommentStore {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const listOptions = trpc.pageComment.list.queryOptions({ pageId });
	const list = useQuery(listOptions);

	const invalidate = useCallback(
		() => queryClient.invalidateQueries({ queryKey: listOptions.queryKey }),
		[queryClient, listOptions.queryKey],
	);

	const sending = useRef(0);

	const beginSend = useCallback(() => {
		sending.current += 1;
	}, []);

	const endSend = useCallback(() => {
		sending.current = Math.max(0, sending.current - 1);
		if (sending.current === 0) invalidate();
	}, [invalidate]);

	const handlers = useMemo(
		() => ({
			onMutate: beginSend,
			onError: (error: { message: string }) => toast.error(errorMessage(error)),
			onSettled: endSend,
		}),
		[beginSend, endSend],
	);

	const optimistic = useMemo(
		() => ({
			onMutate: async (write: (rows: ServerThread[]) => ServerThread[]) => {
				beginSend();
				await queryClient.cancelQueries({ queryKey: listOptions.queryKey });
				const previous = queryClient.getQueryData(listOptions.queryKey);
				queryClient.setQueryData(listOptions.queryKey, write(previous ?? []));
				return { previous };
			},
			onError: (
				error: { message: string },
				context: { previous: ServerThread[] | undefined } | undefined,
			) => {
				queryClient.setQueryData(listOptions.queryKey, context?.previous);
				toast.error(errorMessage(error));
			},
			onSettled: endSend,
		}),
		[queryClient, listOptions.queryKey, beginSend, endSend],
	);

	const create = useMutation(
		trpc.pageComment.create.mutationOptions({
			onMutate: (input) =>
				optimistic.onMutate((rows) => [
					...rows,
					optimisticThread({ input, user, version }),
				]),
			onError: (error, _input, context) => optimistic.onError(error, context),
			onSettled: optimistic.onSettled,
		}),
	);
	const reply = useMutation(
		trpc.pageComment.reply.mutationOptions({
			onMutate: (input) =>
				optimistic.onMutate((rows) =>
					rows.map((row) =>
						row.id === input.threadId
							? {
									...row,
									comments: [
										...row.comments,
										optimisticComment({ body: input.body, user }),
									],
								}
							: row,
					),
				),
			onError: (error, _input, context) => optimistic.onError(error, context),
			onSettled: optimistic.onSettled,
		}),
	);
	const edit = useMutation(trpc.pageComment.edit.mutationOptions(handlers));
	const resolve = useMutation(
		trpc.pageComment.resolve.mutationOptions(handlers),
	);
	const remove = useMutation(trpc.pageComment.delete.mutationOptions(handlers));

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
					anchor: {
						path: anchor.path,
						tag: anchor.tag,
						offsetX: anchor.offsetX,
						offsetY: anchor.offsetY,
					},
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
