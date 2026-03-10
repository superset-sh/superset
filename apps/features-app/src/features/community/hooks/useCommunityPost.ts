/**
 * Community Post Hooks
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useCommunityPosts(options: {
  communitySlug?: string;
  communityId?: string;
  limit?: number;
}) {
  const trpc = useTRPC();
  return useInfiniteQuery(
    trpc.community.post.list.infiniteQueryOptions(options, {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
  );
}

export function useCommunityPost(id: string) {
  const trpc = useTRPC();
  return useQuery(trpc.community.post.byId.queryOptions(id));
}

export function useCreatePost() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const getTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  let optimisticContext: {
    previousLists: Array<[readonly unknown[], unknown]>;
  } | null = null;

  return useMutation({
    ...trpc.community.post.create.mutationOptions(),
    onMutate: async (newPost) => {
      await queryClient.cancelQueries({ queryKey: trpc.community.post.list.queryKey() });
      const previousLists = queryClient.getQueriesData({
        queryKey: trpc.community.post.list.queryKey(),
      });


      const allQueries = queryClient.getQueriesData<any>({
        queryKey: trpc.community.post.list.queryKey(),
      });

      const tempPost = {
        id: getTempId(),
        title: newPost.title,
        content: newPost.content,
        type: newPost.type,
        communitySlug: newPost.communitySlug,
        voteScore: 0,
        upvoteCount: 0,
        downvoteCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
      };

      for (const [queryKey, data] of allQueries) {
        if (!data?.pages?.length) continue;


        const queryKeyStr = JSON.stringify(queryKey);
        const matchesCommunity =
          queryKeyStr.includes(newPost.communitySlug) || !queryKeyStr.includes("communitySlug");

        if (!matchesCommunity) continue;

        queryClient.setQueryData(queryKey, {
          ...data,
          pages: data.pages.map((page: any, index: number) =>
            index === 0
              ? {
                  ...page,
                  items: [tempPost, ...(page.items ?? [])],
                }
              : page,
          ),
        });
      }

      optimisticContext = { previousLists };
      return undefined;
    },
    onError: () => {
      if (optimisticContext?.previousLists) {
        for (const [queryKey, data] of optimisticContext.previousLists) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => {
      optimisticContext = null;
      queryClient.invalidateQueries({ queryKey: trpc.community.post.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.byId.queryKey() });
    },
  });
}

export function useUpdatePost() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.community.post.update.mutationOptions(),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: trpc.community.post.byId.queryKey(input.id) });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.list.queryKey() });
    },
  });
}

export function useDeletePost() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.community.post.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.post.list.queryKey() });
    },
  });
}

/**
 * Optimistic vote helper: compute deltas based on current userVote and new vote.
 *
 * Server semantics:
 * - same vote clicked → no-op (server ignores)
 * - new vote (no previous) → score ±1, increment up/down count
 * - flip vote (up↔down) → score ±2, swap up/down counts
 */
function computeVoteDeltas(
  currentUserVote: number | null | undefined,
  newVote: 1 | -1,
): { scoreDelta: number; upDelta: number; downDelta: number; newUserVote: number | null } {
  // Same vote → no-op
  if (currentUserVote === newVote) {
    return { scoreDelta: 0, upDelta: 0, downDelta: 0, newUserVote: currentUserVote };
  }

  // Flip vote
  if (currentUserVote === 1 && newVote === -1) {
    return { scoreDelta: -2, upDelta: -1, downDelta: 1, newUserVote: -1 };
  }
  if (currentUserVote === -1 && newVote === 1) {
    return { scoreDelta: 2, upDelta: 1, downDelta: -1, newUserVote: 1 };
  }

  // New vote (no previous)
  return {
    scoreDelta: newVote,
    upDelta: newVote === 1 ? 1 : 0,
    downDelta: newVote === -1 ? 1 : 0,
    newUserVote: newVote,
  };
}

function applyVoteDelta(item: any, deltas: ReturnType<typeof computeVoteDeltas>) {
  return {
    ...item,
    voteScore: item.voteScore + deltas.scoreDelta,
    upvoteCount: Math.max(0, item.upvoteCount + deltas.upDelta),
    downvoteCount: Math.max(0, item.downvoteCount + deltas.downDelta),
    userVote: deltas.newUserVote,
  };
}

export function useVote() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  let optimisticContext: {
    previousPost: unknown;
    previousLists: Array<[readonly unknown[], unknown]>;
    previousComments: Array<[readonly unknown[], unknown]>;
  } | null = null;

  return useMutation({
    ...trpc.community.vote.cast.mutationOptions(),
    onMutate: (variables) => {
      void queryClient.cancelQueries({
        queryKey: trpc.community.post.byId.queryKey(variables.targetId),
      });
      void queryClient.cancelQueries({ queryKey: trpc.community.post.list.queryKey() });
      void queryClient.cancelQueries({ queryKey: trpc.community.post.comments.queryKey() });

      const previousPost = queryClient.getQueryData(
        trpc.community.post.byId.queryKey(variables.targetId),
      );
      const previousLists = queryClient.getQueriesData({
        queryKey: trpc.community.post.list.queryKey(),
      });
      const previousComments = queryClient.getQueriesData({
        queryKey: trpc.community.post.comments.queryKey(),
      });

      if (variables.targetType === "post") {

        queryClient.setQueryData(
          trpc.community.post.byId.queryKey(variables.targetId),
          (old: any) => {
            if (!old) return old;
            const deltas = computeVoteDeltas(old.userVote, variables.vote as 1 | -1);
            return applyVoteDelta(old, deltas);
          },
        );


        queryClient.setQueriesData(
          { queryKey: trpc.community.post.list.queryKey() },
          (old: any) => {
            if (!old?.pages) return old;
            return {
              ...old,
              pages: old.pages.map((page: any) => ({
                ...page,
                items: page.items.map((item: any) => {
                  if (item.id !== variables.targetId) return item;
                  const deltas = computeVoteDeltas(item.userVote, variables.vote as 1 | -1);
                  return applyVoteDelta(item, deltas);
                }),
              })),
            };
          },
        );
      }

      if (variables.targetType === "comment") {
        queryClient.setQueriesData(
          { queryKey: trpc.community.post.comments.queryKey() },
          (old: any) => {
            if (!old?.pages) return old;
            return {
              ...old,
              pages: old.pages.map((page: any) => ({
                ...page,
                items: page.items.map((item: any) => {
                  if (item.id !== variables.targetId) return item;
                  const deltas = computeVoteDeltas(item.userVote, variables.vote as 1 | -1);
                  return applyVoteDelta(item, deltas);
                }),
              })),
            };
          },
        );
      }

      optimisticContext = { previousPost, previousLists, previousComments };
      return undefined;
    },
    onError: (_err, variables) => {
      if (optimisticContext?.previousPost) {
        queryClient.setQueryData<any>(
          trpc.community.post.byId.queryKey(variables.targetId),
          optimisticContext.previousPost,
        );
      }
      if (optimisticContext?.previousLists) {
        for (const [queryKey, data] of optimisticContext.previousLists) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (optimisticContext?.previousComments) {
        for (const [queryKey, data] of optimisticContext.previousComments) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => {
      optimisticContext = null;
      queryClient.invalidateQueries({ queryKey: trpc.community.post.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.byId.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.comments.queryKey() });
    },
  });
}
