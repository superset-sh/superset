/**
 * Create Review Mutation Hook
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

export interface CreateReviewInput {
  targetType: string;
  targetId: string;
  rating: number;
  title: string;
  content: string;
  images?: string[];
  verifiedPurchase?: boolean;
}

/**
 * Create a new review
 */
export function useCreateReview() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.review.create.mutationOptions(),
    onSuccess: (_data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: [["review", "list"], { input: { targetType: variables.targetType, targetId: variables.targetId } }],
      });
      queryClient.invalidateQueries({
        queryKey: [["review", "getSummary"], { input: { targetType: variables.targetType, targetId: variables.targetId } }],
      });
    },
  });
}
