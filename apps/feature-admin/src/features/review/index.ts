/**
 * Review Feature - Client
 *
 * Polymorphic review/rating system that can attach to any entity type
 * (board_post, product, content, course, etc.)
 */

// Routes & Constants
export { REVIEW_ADMIN_PATH, createReviewAdminRoutes } from "./routes";

// UI - Pages
export { ReviewSection, ReviewSummary, ReviewList, ReviewForm, ReviewManager, ReportQueue } from "./pages";

// Hooks (for custom implementations)
export {
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
  useAdminPendingReviews,
  useAdminUpdateStatus,
  useAdminReports,
  useAdminResolveReport,
} from "./hooks";

// Types
export type * from "./types";
