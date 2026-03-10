/**
 * Review tRPC Router
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authProcedure, adminProcedure, getAuthUserId, createSingleServiceContainer } from "../../../core/trpc";
import type { ReviewService } from "../service/review.service";

// ============================================================================
// Zod Schemas
// ============================================================================

const createReviewSchema = z.object({
  targetType: z.string().min(1).describe("Target entity type (e.g., board_post, product)"),
  targetId: z.string().uuid().describe("Target entity ID"),
  rating: z.number().min(1).max(5).describe("Rating (1-5)"),
  title: z.string().min(1).max(200).describe("Review title"),
  content: z.string().min(10).max(2000).describe("Review content (10-2000 characters)"),
  images: z.array(z.string().uuid()).max(10).optional().describe("File IDs (max 10)"),
  verifiedPurchase: z.boolean().optional().describe("Verified purchase flag"),
});

const updateReviewSchema = z.object({
  title: z.string().min(1).max(200).optional().describe("Review title"),
  content: z.string().min(10).max(2000).optional().describe("Review content"),
  images: z.array(z.string().uuid()).max(10).optional().describe("File IDs"),
});

const queryReviewsSchema = z.object({
  targetType: z.string().min(1).describe("Target entity type"),
  targetId: z.string().uuid().describe("Target entity ID"),
  page: z.number().min(1).default(1).describe("Page number"),
  limit: z.number().min(1).max(50).default(10).describe("Items per page"),
  sort: z
    .enum(["recent", "rating_high", "rating_low", "helpful", "oldest"])
    .default("recent")
    .describe("Sort order"),
  ratingFilter: z.number().min(1).max(5).optional().describe("Filter by rating"),
});

const reportReviewSchema = z.object({
  reviewId: z.string().uuid().describe("Review ID to report"),
  reason: z
    .enum(["spam", "inappropriate", "offensive", "fake", "other"])
    .describe("Report reason"),
  details: z.string().max(500).optional().describe("Additional details (max 500 characters)"),
});

// ============================================================================
// Service Container (injected via NestJS Module.onModuleInit)
// ============================================================================

const { service: getReviewService, inject: injectReviewService } =
  createSingleServiceContainer<ReviewService>();

export { injectReviewService };

// ============================================================================
// Router
// ============================================================================

export const reviewRouter = router({
  // ==========================================================================
  // Public Procedures
  // ==========================================================================

  /**
   * List reviews for a target with pagination and filtering
   */
  list: publicProcedure.input(queryReviewsSchema).query(async ({ input }) => {
    return getReviewService().findByTarget(input);
  }),

  /**
   * Get review summary (average, distribution, count)
   */
  getSummary: publicProcedure
    .input(
      z.object({
        targetType: z.string().describe("Target entity type"),
        targetId: z.string().uuid().describe("Target entity ID"),
      })
    )
    .query(async ({ input }) => {
      return getReviewService().getSummary(input.targetType, input.targetId);
    }),

  /**
   * Get batch summaries for multiple targets (performance optimization)
   */
  getSummaryBatch: publicProcedure
    .input(
      z.object({
        targetType: z.string().describe("Target entity type"),
        targetIds: z.array(z.string().uuid()).min(1).max(50).describe("Target entity IDs (max 50)"),
      })
    )
    .query(async ({ input }) => {
      const summaryMap = await getReviewService().getSummaryBatch(input.targetType, input.targetIds);
      // Convert Map to object for JSON serialization
      return Object.fromEntries(summaryMap);
    }),

  /**
   * Get a single review by ID
   */
  get: publicProcedure
    .input(
      z.object({
        id: z.string().uuid().describe("Review ID"),
      })
    )
    .query(async ({ input }) => {
      const review = await getReviewService().findById(input.id);
      if (!review) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
      }
      return review;
    }),

  // ==========================================================================
  // Auth Procedures (require authentication)
  // ==========================================================================

  /**
   * Create a new review
   */
  create: authProcedure.input(createReviewSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);

    // Check for existing review
    const exists = await getReviewService().checkExistingReview(userId, input.targetType, input.targetId);
    if (exists) {
      throw new TRPCError({ code: "CONFLICT", message: "You have already reviewed this item" });
    }

    return getReviewService().create(userId, input);
  }),

  /**
   * Update a review
   */
  update: authProcedure
    .input(
      z.object({
        id: z.string().uuid().describe("Review ID"),
        data: updateReviewSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);

      return getReviewService().update(input.id, userId, input.data);
    }),

  /**
   * Delete a review (soft delete)
   */
  delete: authProcedure
    .input(
      z.object({
        id: z.string().uuid().describe("Review ID"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);

      await getReviewService().delete(input.id, userId);
      return { success: true };
    }),

  /**
   * Toggle helpful vote on a review
   */
  toggleHelpful: authProcedure
    .input(
      z.object({
        reviewId: z.string().uuid().describe("Review ID"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);

      return getReviewService().toggleHelpful(input.reviewId, userId);
    }),

  /**
   * Check if user has voted helpful on a review
   */
  getHelpfulStatus: authProcedure
    .input(
      z.object({
        reviewId: z.string().uuid().describe("Review ID"),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);

      const hasVoted = await getReviewService().getHelpfulStatus(input.reviewId, userId);
      return { hasVoted };
    }),

  /**
   * Report a review for abuse
   */
  report: authProcedure.input(reportReviewSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);

    await getReviewService().createReport(input.reviewId, userId, input.reason, input.details);
    return { success: true };
  }),

  // ==========================================================================
  // Admin Procedures (require admin role)
  // ==========================================================================

  /**
   * Update review status (hide/approve/pending)
   */
  adminUpdateStatus: adminProcedure
    .input(
      z.object({
        id: z.string().uuid().describe("Review ID"),
        status: z.enum(["pending", "approved", "hidden"]).describe("New status"),
        reason: z.string().max(500).optional().describe("Reason for status change"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const adminId = getAuthUserId(ctx);

      return getReviewService().adminUpdateStatus(input.id, input.status, adminId, input.reason);
    }),

  /**
   * Get pending reviews for moderation
   */
  adminGetPendingReviews: adminProcedure.query(async () => {
    return getReviewService().adminGetPendingReviews();
  }),

  /**
   * Get reports, optionally filtered by status
   */
  adminGetReports: adminProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "resolved", "dismissed"]).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return getReviewService().adminGetReports(input?.status);
    }),

  /**
   * Resolve a report
   */
  adminResolveReport: adminProcedure
    .input(
      z.object({
        reportId: z.string().uuid().describe("Report ID"),
        action: z.enum(["resolved", "dismissed"]).describe("Resolution action"),
        notes: z.string().max(1000).optional().describe("Admin notes"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const adminId = getAuthUserId(ctx);

      await getReviewService().resolveReport(input.reportId, input.action, adminId, input.notes);
      return { success: true };
    }),
});

export type ReviewRouter = typeof reviewRouter;
