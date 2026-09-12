import type { CommentAnchor } from "@superset/shared/page-comments-runtime";
import type { RouterOutputs } from "@superset/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "@/lib/trpc/client";

export type ServerThread = RouterOutputs["pageComment"]["list"][number];

export interface AnchoredThread {
	id: string;
	anchor: CommentAnchor;
	resolved: boolean;
	comments: ServerThread["comments"];
}

export function pageCommentsKey(pageId: string) {
	return ["cloud", "pageComment", "list", pageId];
}

export function usePageCommentsQuery(pageId: string | undefined) {
	return useQuery({
		queryKey: pageCommentsKey(pageId ?? ""),
		enabled: Boolean(pageId),
		queryFn: () =>
			apiClient.pageComment.list.query({ pageId: pageId as string }),
	});
}

export function toAnchoredThreads(rows: ServerThread[]): AnchoredThread[] {
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
						comments: row.comments,
					},
				]
			: [],
	);
}

export function usePageCommentActions(pageId: string | undefined) {
	const queryClient = useQueryClient();
	const invalidate = useCallback(() => {
		if (pageId) {
			void queryClient.invalidateQueries({ queryKey: pageCommentsKey(pageId) });
		}
	}, [pageId, queryClient]);

	const createThread = useMutation({
		mutationFn: (input: {
			version: number;
			anchor: CommentAnchor;
			body: string;
		}) =>
			apiClient.pageComment.create.mutate({
				pageId: pageId as string,
				version: input.version,
				anchorKind: "element",
				anchor: {
					path: input.anchor.path,
					tag: input.anchor.tag,
					offsetX: input.anchor.offsetX,
					offsetY: input.anchor.offsetY,
				},
				anchorText: input.anchor.text || null,
				body: input.body,
			}),
		onSuccess: invalidate,
	});

	const reply = useMutation({
		mutationFn: (input: { threadId: string; body: string }) =>
			apiClient.pageComment.reply.mutate(input),
		onSuccess: invalidate,
	});

	const setResolved = useMutation({
		mutationFn: (input: { threadId: string; resolved: boolean }) =>
			apiClient.pageComment.resolve.mutate(input),
		onMutate: async (input) => {
			if (!pageId) return;
			const key = pageCommentsKey(pageId);
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<ServerThread[]>(key);
			queryClient.setQueryData<ServerThread[]>(key, (rows) =>
				rows?.map((row) =>
					row.id === input.threadId
						? { ...row, resolved: input.resolved }
						: row,
				),
			);
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (pageId && context?.previous) {
				queryClient.setQueryData(pageCommentsKey(pageId), context.previous);
			}
		},
		onSettled: invalidate,
	});

	return { createThread, reply, setResolved };
}
