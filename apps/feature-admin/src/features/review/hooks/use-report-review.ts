/**
 * Report Review Hook
 */
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";
import type { ReportReason } from "../types";

export interface ReportReviewInput {
  reviewId: string;
  reason: ReportReason;
  details?: string;
}

/**
 * Report a review for abuse
 */
export function useReportReview() {
  const trpc = useTRPC();

  return useMutation({
    ...trpc.review.report.mutationOptions(),
  });
}
