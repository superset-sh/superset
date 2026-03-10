/**
 * Review Summary Hook
 */
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@superbuilder/features-client/trpc-client";

/**
 * Get review summary (average rating, distribution, count)
 */
export function useReviewSummary(targetType: string, targetId: string) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.review.getSummary.queryOptions({
      targetType,
      targetId,
    }),
    enabled: !!targetType && !!targetId,
    staleTime: 5 * 60 * 1000, // 5 minutes - summaries change less frequently
  });
}

/**
 * Get batch summaries for multiple targets (performance optimization)
 */
export function useReviewSummaryBatch(targetType: string, targetIds: string[]) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.review.getSummaryBatch.queryOptions({
      targetType,
      targetIds,
    }),
    enabled: !!targetType && targetIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
