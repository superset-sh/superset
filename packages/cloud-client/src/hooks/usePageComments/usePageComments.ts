import type {
	CommentStore,
	PageCommentUser,
} from "@superset/shared/page-comments";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { optimisticComment, optimisticThread } from "../../lib/optimisticRows";
import { pageCommentKeys } from "../../lib/pageCommentKeys";
import {
	appendComment,
	editCommentBody,
	insertThread,
	removeThread,
	replaceComment,
	replaceThread,
	setThreadResolved,
} from "../../lib/threadRows";
import { useCloudClient } from "../../providers/CloudClientProvider";
import type {
	CreateThreadArgs,
	DeleteArgs,
	EditArgs,
	ReplyArgs,
	ResolveArgs,
	ServerComment,
	ServerThread,
} from "../../types";
import { usePageCommentThreads } from "../usePageCommentThreads";

interface UsePageCommentsOptions {
	pageId: string;
	version: number;
	user: PageCommentUser;
	onError?: (error: unknown) => void;
}

export interface PageCommentStore extends CommentStore {
	submitting: boolean;
}

interface Rollback {
	previous: ServerThread[] | undefined;
	placeholderId: string;
}

export function usePageComments({
	pageId,
	version,
	user,
	onError,
}: UsePageCommentsOptions): PageCommentStore {
	const client = useCloudClient();
	const queryClient = useQueryClient();

	const queryKey = useMemo(() => pageCommentKeys.list(pageId), [pageId]);
	const { threads, isLoading } = usePageCommentThreads({ pageId, version });

	const patch = useCallback(
		(write: (rows: ServerThread[]) => ServerThread[]) => {
			queryClient.setQueryData<ServerThread[]>(queryKey, (rows) =>
				write(rows ?? []),
			);
		},
		[queryClient, queryKey],
	);

	const begin = useCallback(
		async (
			placeholderId: string,
			write: (rows: ServerThread[]) => ServerThread[],
		): Promise<Rollback> => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<ServerThread[]>(queryKey);
			patch(write);
			return { previous, placeholderId };
		},
		[patch, queryClient, queryKey],
	);

	const meta = useMemo(() => ({ pageCommentsFor: pageId }), [pageId]);

	const settle = useCallback(() => {
		const inFlight = queryClient.isMutating({
			predicate: (mutation) =>
				mutation.options.meta?.pageCommentsFor === pageId,
		});
		if (inFlight === 1) void queryClient.invalidateQueries({ queryKey });
	}, [pageId, queryClient, queryKey]);

	const rollback = useCallback(
		(error: unknown, _variables: unknown, context: Rollback | undefined) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKey, context.previous);
			} else if (context) {
				queryClient.removeQueries({ queryKey });
			}
			onError?.(error);
		},
		[onError, queryClient, queryKey],
	);

	const create = useMutation<ServerThread, unknown, CreateThreadArgs, Rollback>(
		{
			mutationFn: (input) => client.pageComment.create.mutate(input),
			onMutate: (input) => {
				const row = optimisticThread({ input, user, version });
				return begin(row.id, (rows) => insertThread(rows, row));
			},
			onSuccess: (row, _input, context) => {
				patch((rows) => replaceThread(rows, context.placeholderId, row));
			},
			onError: rollback,
			onSettled: settle,
			meta,
		},
	);

	const reply = useMutation<ServerComment, unknown, ReplyArgs, Rollback>({
		mutationFn: (input) => client.pageComment.reply.mutate(input),
		onMutate: (input) => {
			const comment = optimisticComment({ body: input.body, user });
			return begin(comment.id, (rows) =>
				appendComment(rows, input.threadId, comment),
			);
		},
		onSuccess: (comment: ServerComment, input, context) => {
			patch((rows) =>
				replaceComment(rows, input.threadId, context.placeholderId, comment),
			);
		},
		onError: rollback,
		onSettled: settle,
		meta,
	});

	const edit = useMutation<unknown, unknown, EditArgs, Rollback>({
		mutationFn: (input) => client.pageComment.edit.mutate(input),
		onMutate: (input) =>
			begin(input.commentId, (rows) =>
				editCommentBody(rows, input.commentId, input.body),
			),
		onError: rollback,
		onSettled: settle,
		meta,
	});

	const resolve = useMutation<unknown, unknown, ResolveArgs, Rollback>({
		mutationFn: (input) => client.pageComment.resolve.mutate(input),
		onMutate: (input) =>
			begin(input.threadId, (rows) =>
				setThreadResolved(rows, input.threadId, input.resolved),
			),
		onError: rollback,
		onSettled: settle,
		meta,
	});

	const remove = useMutation<unknown, unknown, DeleteArgs, Rollback>({
		mutationFn: (input) => client.pageComment.delete.mutate(input),
		onMutate: (input) =>
			begin(input.threadId, (rows) => removeThread(rows, input.threadId)),
		onError: rollback,
		onSettled: settle,
		meta,
	});

	const submitting =
		create.isPending ||
		reply.isPending ||
		edit.isPending ||
		resolve.isPending ||
		remove.isPending;

	const { mutateAsync: createThread } = create;
	const { mutateAsync: addReply } = reply;
	const { mutateAsync: editComment } = edit;
	const { mutateAsync: setResolved } = resolve;
	const { mutateAsync: deleteThread } = remove;

	return useMemo<PageCommentStore>(
		() => ({
			threads,
			isLoading,
			submitting,
			createThread: async ({ anchor, anchorText, body, intent }) => {
				await createThread({
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
					intent,
				});
			},
			addReply: async (threadId, body) => {
				await addReply({ threadId, body });
			},
			editComment: async (_threadId, commentId, body) => {
				await editComment({ commentId, body });
			},
			setResolved: async (threadId, resolved) => {
				await setResolved({ threadId, resolved });
			},
			deleteThread: async (threadId) => {
				await deleteThread({ threadId });
			},
		}),
		[
			threads,
			isLoading,
			submitting,
			createThread,
			addReply,
			editComment,
			setResolved,
			deleteThread,
			pageId,
			version,
		],
	);
}
