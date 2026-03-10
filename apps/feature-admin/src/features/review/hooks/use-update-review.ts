/**
 * Update Review Mutation Hook
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

export interface UpdateReviewInput {
  title?: string;
  content?: string;
  images?: string[];
}

/**
 * Update an existing review
 */
export function useUpdateReview() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.review.update.mutationOptions(),
    onSuccess: (data) => {
      // Invalidate the specific review
      queryClient.invalidateQueries({
        queryKey: [["review", "get"], { input: { id: data.id } }],
      });
      // Invalidate list queries that might contain this review
      queryClient.invalidateQueries({
        queryKey: [["review", "list"]],
      });
    },
  });
}
