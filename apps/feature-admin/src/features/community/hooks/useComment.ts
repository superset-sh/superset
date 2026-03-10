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

  return useMutation({
    ...trpc.community.comment.create.mutationOptions(),
    onSuccess: () => {
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

  return useMutation({
    ...trpc.community.comment.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.post.comments.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.post.byId.queryKey() });
    },
  });
}
