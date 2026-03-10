/**
 * Admin Review Hooks
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

/**
 * Get pending reviews for moderation
 */
export function useAdminPendingReviews() {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.review.adminGetPendingReviews.queryOptions(),
  });
}

/**
 * Update review status (hide/approve/pending)
 */
export function useAdminUpdateStatus() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.review.adminUpdateStatus.mutationOptions(),
    onSuccess: () => {
      // Invalidate all review queries
      queryClient.invalidateQueries({
        queryKey: [["review"]],
      });
    },
  });
}
