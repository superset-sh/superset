/**
 * Delete Review Mutation Hook
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

/**
 * Delete a review (soft delete)
 */
export function useDeleteReview() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.review.delete.mutationOptions(),
    onSuccess: () => {
      // Invalidate all review queries to reflect deletion
      queryClient.invalidateQueries({
        queryKey: [["review"]],
      });
    },
  });
}
