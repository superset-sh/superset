/**
 * Review Feature - Client
 *
 * Public components/hooks re-exported from @superbuilder/widgets/review.
 * Admin-only components remain local.
 */

// Widget re-exports (public components + hooks)
export {
  ReviewSection,
  ReviewSummary,
  ReviewList,
  ReviewForm,
  RatingStars,
  RatingDistribution,
  ReviewCard,
  useReviews,
  useReview,
  useReviewSummary,
  useReviewSummaryBatch,
  useCreateReview,
  useUpdateReview,
  useDeleteReview,
  useVoteHelpful,
  useHelpfulStatus,
  useReportReview,
} from "@superbuilder/widgets/review";

// Admin-only components (local)
export { ReviewManager } from "./pages/review-manager";
export { ReportQueue } from "./pages/report-queue";

// Admin hooks (local)
export {
  useAdminPendingReviews,
  useAdminUpdateStatus,
} from "./hooks/use-admin-reviews";
export {
  useAdminReports,
  useAdminResolveReport,
} from "./hooks/use-admin-reports";

// Types
export type * from "@superbuilder/widgets/review";
