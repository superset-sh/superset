/**
 * Review Query Hooks
 */
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";
import type { SortOrder } from "../types";

export interface UseReviewsOptions {
  targetType: string;
  targetId: string;
  page?: number;
  limit?: number;
  sort?: SortOrder;
  ratingFilter?: number;
}

/**
 * Query reviews for a target entity
 */
export function useReviews(options: UseReviewsOptions) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.review.list.queryOptions({
      targetType: options.targetType,
      targetId: options.targetId,
      page: options.page || 1,
      limit: options.limit || 10,
      sort: options.sort || "recent",
      ratingFilter: options.ratingFilter,
    }),
    enabled: !!options.targetType && !!options.targetId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Get a single review by ID
 */
export function useReview(id: string) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.review.get.queryOptions({ id }),
    enabled: !!id,
  });
}
