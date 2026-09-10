import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import {
	type CommentStore,
	optimisticId,
	type PageCommentUser,
} from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { toThreads } from "renderer/routes/_authenticated/_dashboard/utils/toThreads";

type ServerThread = RouterOutputs["pageComment"]["list"][number];

function optimisticComment({
	body,
	user,
}: {
	body: string;
	user: PageCommentUser;
}): ServerThread["comments"][number] {
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
		id: optimisticId(),
		anchorKind: "element",
		anchor: input.anchor ?? null,
		anchorText: input.anchorText ?? null,
		resolved: false,
		createdAt: new Date(),
		version,
		createdByUserId: user.id,
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
	const utils = cloudTrpc.useUtils();
	const list = cloudTrpc.pageComment.list.useQuery(
		{ pageId },
		{ enabled: version > 0 },
	);

	const queryClient = useQueryClient();

	const settle = useCallback(() => {
		const inFlight = queryClient.isMutating({
			predicate: (mutation) =>
				mutation.options.meta?.pageCommentsFor === pageId,
		});
		if (inFlight === 1) utils.pageComment.list.invalidate({ pageId });
	}, [queryClient, utils, pageId]);

	const meta = useMemo(() => ({ pageCommentsFor: pageId }), [pageId]);

	const handlers = useMemo(
		() => ({
			meta,
			onError: (error: { message: string }) => toast.error(errorMessage(error)),
			onSettled: settle,
		}),
		[meta, settle],
	);

	const optimistic = useMemo(
		() => ({
			onMutate: async (write: (rows: ServerThread[]) => ServerThread[]) => {
				await utils.pageComment.list.cancel({ pageId });
				const previous = utils.pageComment.list.getData({ pageId });
				utils.pageComment.list.setData({ pageId }, write(previous ?? []));
				return { previous };
			},
			onError: (
				error: { message: string },
				context: { previous: ServerThread[] | undefined } | undefined,
			) => {
				if (context?.previous) {
					utils.pageComment.list.setData({ pageId }, context.previous);
				} else {
					utils.pageComment.list.reset({ pageId });
				}
				toast.error(errorMessage(error));
			},
			onSettled: settle,
		}),
		[utils, pageId, settle],
	);

	const create = cloudTrpc.pageComment.create.useMutation({
		meta,
		onMutate: (input) =>
			optimistic.onMutate((rows) => [
				...rows,
				optimisticThread({ input, user, version }),
			]),
		onError: (error, _input, context) => optimistic.onError(error, context),
		onSettled: optimistic.onSettled,
	});
	const reply = cloudTrpc.pageComment.reply.useMutation({
		meta,
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
	});
	const edit = cloudTrpc.pageComment.edit.useMutation(handlers);
	const resolve = cloudTrpc.pageComment.resolve.useMutation(handlers);
	const remove = cloudTrpc.pageComment.delete.useMutation(handlers);

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
