/**
 * Helpful Vote Hooks
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

/**
 * Toggle helpful vote on a review
 */
export function useVoteHelpful() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.review.toggleHelpful.mutationOptions(),
    onSuccess: (_data, variables) => {
      // Invalidate the specific review to update helpful count
      queryClient.invalidateQueries({
        queryKey: [["review", "get"], { input: { id: variables.reviewId } }],
      });
      // Invalidate helpful status
      queryClient.invalidateQueries({
        queryKey: [["review", "getHelpfulStatus"], { input: { reviewId: variables.reviewId } }],
      });
      // Invalidate list queries to update counts
      queryClient.invalidateQueries({
        queryKey: [["review", "list"]],
      });
    },
  });
}

/**
 * Check if user has voted helpful on a review
 */
export function useHelpfulStatus(reviewId: string) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.review.getHelpfulStatus.queryOptions({ reviewId }),
    enabled: !!reviewId,
  });
}
