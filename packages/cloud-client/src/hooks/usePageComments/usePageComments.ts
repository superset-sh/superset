import type {
	CommentImageUpload,
	CommentStore,
	ComposedImage,
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

/**
 * The wire input plus the composed previews the optimistic row renders
 * until the server answers with served URLs. `composed` never leaves the
 * client — the mutation fn strips it.
 */
type CreateThreadVars = CreateThreadArgs & { composed?: ComposedImage[] };
type ReplyVars = ReplyArgs & { composed?: ComposedImage[] };

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

	const create = useMutation<ServerThread, unknown, CreateThreadVars, Rollback>(
		{
			mutationFn: ({ composed: _composed, ...input }) =>
				client.pageComment.create.mutate(input),
			onMutate: (input) => {
				const row = optimisticThread({
					input: { ...input, attachments: input.composed },
					user,
					version,
				});
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

	const reply = useMutation<ServerComment, unknown, ReplyVars, Rollback>({
		mutationFn: ({ composed: _composed, ...input }) =>
			client.pageComment.reply.mutate(input),
		onMutate: (input) => {
			const comment = optimisticComment({
				body: input.body,
				user,
				attachments: input.composed,
			});
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

	const uploadImage = useCallback(
		async (file: CommentImageUpload): Promise<{ fileId: string }> => {
			const digest = await crypto.subtle.digest("SHA-256", file.bytes);
			const sha256 = [...new Uint8Array(digest)]
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
			const { fileId, upload } =
				await client.pageComment.createImageUpload.mutate({
					pageId,
					name: file.name,
					contentType: file.contentType,
					sizeBytes: file.bytes.byteLength,
					sha256,
				});
			const response = await fetch(upload.url, {
				method: "PUT",
				headers: upload.headers,
				body: file.bytes,
			});
			if (!response.ok) {
				throw new Error(`Image upload failed (${response.status})`);
			}
			return { fileId };
		},
		[client, pageId],
	);

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
			createThread: async ({
				anchor,
				anchorText,
				body,
				intent,
				attachments,
			}) => {
				await createThread({
					pageId,
					version,
					...(anchor
						? {
								anchorKind: "element" as const,
								anchor: {
									path: anchor.path,
									tag: anchor.tag,
									offsetX: anchor.offsetX,
									offsetY: anchor.offsetY,
								},
								anchorText: anchorText?.slice(0, 500) || null,
							}
						: { anchorKind: "page" as const, anchor: null, anchorText: null }),
					body,
					intent,
					attachments: attachments?.map((image) => image.fileId),
					composed: attachments,
				});
			},
			addReply: async (threadId, body, attachments) => {
				await addReply({
					threadId,
					body,
					attachments: attachments?.map((image) => image.fileId),
					composed: attachments,
				});
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
			uploadImage,
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
			uploadImage,
			pageId,
			version,
		],
	);
}
