/**
 * Community Post Hooks
 */
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useCommunityPosts(options: {
  communitySlug?: string;
  communityId?: string;
  limit?: number;
}) {
  const trpc = useTRPC();
  return useInfiniteQuery(
    trpc.community.post.list.infiniteQueryOptions(
      options,
      { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
    ),
  );
}

export function useCommunityPost(id: string) {
  const trpc = useTRPC();
  return useQuery(trpc.community.post.byId.queryOptions(id));
}

export function useCreatePost() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.community.post.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.post.list.queryKey() });
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

export function useVote() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.community.vote.cast.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.post.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.byId.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.comments.queryKey() });
    },
  });
}
