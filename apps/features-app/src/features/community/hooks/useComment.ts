/**
 * Community Comment Hooks
 */
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function usePostComments(postId: string, sort?: "old" | "new") {
  const trpc = useTRPC();
  return useInfiniteQuery(
    trpc.community.post.comments.infiniteQueryOptions(
      { postId, sort: sort ?? "old" },
      { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
    ),
  );
}

export function useCreateComment() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const getTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  let optimisticContext: {
    previousComments: Array<[readonly unknown[], unknown]>;
  } | null = null;

  return useMutation({
    ...trpc.community.comment.create.mutationOptions(),
    onMutate: async (newComment) => {
      await queryClient.cancelQueries({ queryKey: trpc.community.post.comments.queryKey() });
      const previousComments = queryClient.getQueriesData({
        queryKey: trpc.community.post.comments.queryKey(),
      });

      queryClient.setQueriesData(
        { queryKey: trpc.community.post.comments.queryKey() },
        (old: any) => {
          if (!old?.pages?.length) return old;

          const tempComment = {
            id: getTempId(),
            content: newComment.content,
            parentId: newComment.parentId ?? null,
            voteScore: 0,
            upvoteCount: 0,
            downvoteCount: 0,
            createdAt: new Date().toISOString(),
          };

          const lastPageIndex = old.pages.length - 1;
          return {
            ...old,
            pages: old.pages.map((page: any, index: number) =>
              index === lastPageIndex
                ? {
                    ...page,
                    items: [...(page.items ?? []), tempComment],
                  }
                : page,
            ),
          };
        },
      );

      optimisticContext = { previousComments };
      return undefined;
    },
    onError: () => {
      if (optimisticContext?.previousComments) {
        for (const [queryKey, data] of optimisticContext.previousComments) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => {
      optimisticContext = null;
      queryClient.invalidateQueries({ queryKey: trpc.community.post.comments.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.byId.queryKey() });
    },
  });
}

export function useUpdateComment() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.community.comment.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.post.comments.queryKey() });
    },
  });
}

export function useDeleteComment() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  let optimisticContext: {
    previousComments: Array<[readonly unknown[], unknown]>;
  } | null = null;

  return useMutation({
    ...trpc.community.comment.delete.mutationOptions(),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: trpc.community.post.comments.queryKey() });
      const previousComments = queryClient.getQueriesData({
        queryKey: trpc.community.post.comments.queryKey(),
      });

      queryClient.setQueriesData(
        { queryKey: trpc.community.post.comments.queryKey() },
        (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              items: (page.items ?? []).filter((item: any) => item.id !== variables),
            })),
          };
        },
      );

      optimisticContext = { previousComments };
      return undefined;
    },
    onError: () => {
      if (optimisticContext?.previousComments) {
        for (const [queryKey, data] of optimisticContext.previousComments) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => {
      optimisticContext = null;
      queryClient.invalidateQueries({ queryKey: trpc.community.post.comments.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.byId.queryKey() });
    },
  });
}
