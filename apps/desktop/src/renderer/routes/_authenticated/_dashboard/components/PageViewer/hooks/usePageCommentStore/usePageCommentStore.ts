import { errorMessage } from "@superset/i18n/errors";
import type { CommentStore } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { toThreads } from "renderer/routes/_authenticated/_dashboard/utils/toThreads";

export function usePageCommentStore({
	pageId,
	version,
}: {
	pageId: string;
	version: number;
}): CommentStore {
	const utils = cloudTrpc.useUtils();
	const list = cloudTrpc.pageComment.list.useQuery(
		{ pageId },
		{ enabled: version > 0 },
	);

	const invalidate = useCallback(
		() => utils.pageComment.list.invalidate({ pageId }),
		[utils, pageId],
	);

	const handlers = useMemo(
		() => ({
			onSuccess: invalidate,
			onError: (error: { message: string }) => toast.error(errorMessage(error)),
		}),
		[invalidate],
	);

	const create = cloudTrpc.pageComment.create.useMutation(handlers);
	const reply = cloudTrpc.pageComment.reply.useMutation(handlers);
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
