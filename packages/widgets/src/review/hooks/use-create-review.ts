/**
 * Create Review Mutation Hook
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@superbuilder/features-client/trpc-client";

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
        queryKey: trpc.review.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.review.getSummary.queryKey({ targetType: variables.targetType, targetId: variables.targetId }),
      });
    },
  });
}
