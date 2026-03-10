import { Inject, Injectable, NotFoundException, ConflictException, ForbiddenException, InternalServerErrorException } from "@nestjs/common";
import { and, eq, desc, asc, sql, isNull, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  reviews,
  reviewHelpful,
  reviewReports,
  reviewSummary,
  type Review,
  type ReportReason,
  type ReportStatus,
  type ReviewStatus,
} from "@superbuilder/drizzle";

// ============================================================================
// Types
// ============================================================================

export interface FindByTargetOptions {
  targetType: string;
  targetId: string;
  page: number;
  limit: number;
  sort?: "recent" | "rating_high" | "rating_low" | "helpful" | "oldest";
  ratingFilter?: number;
}

export interface PaginatedReviews {
  items: Review[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ReviewSummaryData {
  averageRating: number;
  totalCount: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface CreateReviewInput {
  targetType: string;
  targetId: string;
  rating: number;
  title: string;
  content: string;
  images?: string[];
  verifiedPurchase?: boolean;
}

export interface UpdateReviewInput {
  title?: string;
  content?: string;
  images?: string[];
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class ReviewService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>) {}

  // ==========================================================================
  // Review CRUD
  // ==========================================================================

  /**
   * Find reviews by target with pagination and filtering
   */
  async findByTarget(options: FindByTargetOptions): Promise<PaginatedReviews> {
    const { targetType, targetId, page, limit, sort = "recent", ratingFilter } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [
      eq(reviews.targetType, targetType),
      eq(reviews.targetId, targetId),
      eq(reviews.status, "approved"),
      isNull(reviews.deletedAt),
    ];

    if (ratingFilter) {
      conditions.push(eq(reviews.rating, ratingFilter));
    }

    // Build order by
    const orderByMap = {
      recent: desc(reviews.createdAt),
      oldest: asc(reviews.createdAt),
      rating_high: desc(reviews.rating),
      rating_low: asc(reviews.rating),
      helpful: desc(reviews.helpfulCount),
    };
    const orderBy = orderByMap[sort] || desc(reviews.createdAt);

    // Execute queries
    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(reviews)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(and(...conditions)),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      items,
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Find a single review by ID
   */
  async findById(id: string): Promise<Review | null> {
    const [review] = await this.db.select().from(reviews).where(eq(reviews.id, id)).limit(1);

    return review || null;
  }

  /**
   * Check if a user already has a review for a target
   */
  async checkExistingReview(userId: string, targetType: string, targetId: string): Promise<boolean> {
    const [existing] = await this.db
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.authorId, userId),
          eq(reviews.targetType, targetType),
          eq(reviews.targetId, targetId),
          isNull(reviews.deletedAt)
        )
      )
      .limit(1);

    return !!existing;
  }

  /**
   * Create a new review
   */
  async create(authorId: string, input: CreateReviewInput): Promise<Review> {
    // Check for existing review
    const exists = await this.checkExistingReview(authorId, input.targetType, input.targetId);
    if (exists) {
      throw new ConflictException("You have already reviewed this item");
    }

    // Create review
    const [review] = await this.db
      .insert(reviews)
      .values({
        ...input,
        authorId,
        images: input.images || [],
        verifiedPurchase: input.verifiedPurchase || false,
      })
      .returning();

    if (!review) {
      throw new InternalServerErrorException("리뷰 생성에 실패했습니다");
    }

    // Update summary
    await this.updateSummary(input.targetType, input.targetId);

    return review;
  }

  /**
   * Update a review
   */
  async update(id: string, authorId: string, input: UpdateReviewInput): Promise<Review> {
    // Check ownership
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException("Review not found");
    }
    if (existing.authorId !== authorId) {
      throw new ForbiddenException("You can only edit your own reviews");
    }

    // Update review
    const [updated] = await this.db
      .update(reviews)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Review with id ${id} not found`);
    }

    return updated;
  }

  /**
   * Soft delete a review
   */
  async delete(id: string, authorId: string): Promise<void> {
    // Check ownership
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException("Review not found");
    }
    if (existing.authorId !== authorId) {
      throw new ForbiddenException("You can only delete your own reviews");
    }

    // Soft delete
    await this.db
      .update(reviews)
      .set({
        deletedAt: new Date(),
        isDeleted: true,
      })
      .where(eq(reviews.id, id));

    // Update summary
    await this.updateSummary(existing.targetType, existing.targetId);
  }

  // ==========================================================================
  // Summary & Aggregation
  // ==========================================================================

  /**
   * Get review summary from denormalized table
   */
  async getSummary(targetType: string, targetId: string): Promise<ReviewSummaryData> {
    // Try to get from summary table first
    const [summary] = await this.db
      .select()
      .from(reviewSummary)
      .where(and(eq(reviewSummary.targetType, targetType), eq(reviewSummary.targetId, targetId)))
      .limit(1);

    if (summary) {
      return {
        averageRating: parseFloat(summary.averageRating || "0"),
        totalCount: summary.totalCount,
        distribution: {
          1: summary.rating1Count,
          2: summary.rating2Count,
          3: summary.rating3Count,
          4: summary.rating4Count,
          5: summary.rating5Count,
        },
      };
    }

    // If not in summary table, calculate and insert
    await this.updateSummary(targetType, targetId);
    return this.getSummary(targetType, targetId);
  }

  /**
   * Batch query for summaries (performance optimization for list views)
   */
  async getSummaryBatch(
    targetType: string,
    targetIds: string[]
  ): Promise<Map<string, ReviewSummaryData>> {
    if (targetIds.length === 0) {
      return new Map();
    }

    const summaries = await this.db
      .select()
      .from(reviewSummary)
      .where(
        and(eq(reviewSummary.targetType, targetType), inArray(reviewSummary.targetId, targetIds))
      );

    const result = new Map<string, ReviewSummaryData>();
    for (const summary of summaries) {
      result.set(summary.targetId, {
        averageRating: parseFloat(summary.averageRating || "0"),
        totalCount: summary.totalCount,
        distribution: {
          1: summary.rating1Count,
          2: summary.rating2Count,
          3: summary.rating3Count,
          4: summary.rating4Count,
          5: summary.rating5Count,
        },
      });
    }

    return result;
  }

  /**
   * Recalculate and update summary table
   */
  async updateSummary(targetType: string, targetId: string): Promise<void> {
    // Calculate aggregates
    const [aggregates] = await this.db
      .select({
        avgRating: sql<string>`COALESCE(AVG(${reviews.rating})::numeric(3,2), 0)`,
        totalCount: sql<number>`COUNT(*)::int`,
        rating1: sql<number>`COUNT(*) FILTER (WHERE ${reviews.rating} = 1)::int`,
        rating2: sql<number>`COUNT(*) FILTER (WHERE ${reviews.rating} = 2)::int`,
        rating3: sql<number>`COUNT(*) FILTER (WHERE ${reviews.rating} = 3)::int`,
        rating4: sql<number>`COUNT(*) FILTER (WHERE ${reviews.rating} = 4)::int`,
        rating5: sql<number>`COUNT(*) FILTER (WHERE ${reviews.rating} = 5)::int`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.targetType, targetType),
          eq(reviews.targetId, targetId),
          eq(reviews.status, "approved"),
          isNull(reviews.deletedAt)
        )
      );

    if (!aggregates) {
      throw new InternalServerErrorException("리뷰 집계 계산에 실패했습니다");
    }

    // Upsert into summary table
    await this.db
      .insert(reviewSummary)
      .values({
        targetType,
        targetId,
        averageRating: aggregates.avgRating,
        totalCount: aggregates.totalCount,
        rating1Count: aggregates.rating1,
        rating2Count: aggregates.rating2,
        rating3Count: aggregates.rating3,
        rating4Count: aggregates.rating4,
        rating5Count: aggregates.rating5,
      })
      .onConflictDoUpdate({
        target: [reviewSummary.targetType, reviewSummary.targetId],
        set: {
          averageRating: aggregates.avgRating,
          totalCount: aggregates.totalCount,
          rating1Count: aggregates.rating1,
          rating2Count: aggregates.rating2,
          rating3Count: aggregates.rating3,
          rating4Count: aggregates.rating4,
          rating5Count: aggregates.rating5,
          updatedAt: new Date(),
        },
      });
  }

  // ==========================================================================
  // Helpful Votes
  // ==========================================================================

  /**
   * Toggle helpful vote for a review
   */
  async toggleHelpful(reviewId: string, userId: string): Promise<{ added: boolean }> {
    // Check if already voted
    const [existing] = await this.db
      .select()
      .from(reviewHelpful)
      .where(and(eq(reviewHelpful.reviewId, reviewId), eq(reviewHelpful.userId, userId)))
      .limit(1);

    if (existing) {
      // Remove vote
      await this.removeHelpfulVote(reviewId, userId);
      return { added: false };
    } else {
      // Add vote
      await this.voteHelpful(reviewId, userId);
      return { added: true };
    }
  }

  /**
   * Add a helpful vote
   */
  async voteHelpful(reviewId: string, userId: string): Promise<void> {
    // Insert vote
    await this.db.insert(reviewHelpful).values({ reviewId, userId });

    // Increment count
    await this.db
      .update(reviews)
      .set({ helpfulCount: sql`${reviews.helpfulCount} + 1` })
      .where(eq(reviews.id, reviewId));
  }

  /**
   * Remove a helpful vote
   */
  async removeHelpfulVote(reviewId: string, userId: string): Promise<void> {
    // Delete vote
    await this.db
      .delete(reviewHelpful)
      .where(and(eq(reviewHelpful.reviewId, reviewId), eq(reviewHelpful.userId, userId)));

    // Decrement count
    await this.db
      .update(reviews)
      .set({ helpfulCount: sql`${reviews.helpfulCount} - 1` })
      .where(eq(reviews.id, reviewId));
  }

  /**
   * Check if user has voted helpful
   */
  async getHelpfulStatus(reviewId: string, userId: string): Promise<boolean> {
    const [vote] = await this.db
      .select()
      .from(reviewHelpful)
      .where(and(eq(reviewHelpful.reviewId, reviewId), eq(reviewHelpful.userId, userId)))
      .limit(1);

    return !!vote;
  }

  // ==========================================================================
  // Reports
  // ==========================================================================

  /**
   * Create a report for a review
   */
  async createReport(
    reviewId: string,
    reporterId: string,
    reason: ReportReason,
    details?: string
  ): Promise<void> {
    // Check for existing report
    const [existing] = await this.db
      .select()
      .from(reviewReports)
      .where(and(eq(reviewReports.reviewId, reviewId), eq(reviewReports.reporterId, reporterId)))
      .limit(1);

    if (existing) {
      throw new ConflictException("You have already reported this review");
    }

    // Create report
    await this.db.insert(reviewReports).values({
      reviewId,
      reporterId,
      reason,
      details,
    });
  }

  /**
   * Get all reports for a review
   */
  async getReportsByReview(reviewId: string) {
    return this.db.select().from(reviewReports).where(eq(reviewReports.reviewId, reviewId));
  }

  /**
   * Resolve a report
   */
  async resolveReport(
    reportId: string,
    action: "resolved" | "dismissed",
    adminId: string,
    notes?: string
  ): Promise<void> {
    await this.db
      .update(reviewReports)
      .set({
        status: action,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        adminNotes: notes,
      })
      .where(eq(reviewReports.id, reportId));
  }

  // ==========================================================================
  // Admin Functions
  // ==========================================================================

  /**
   * Update review status (admin only)
   */
  async adminUpdateStatus(
    id: string,
    status: ReviewStatus,
    _adminId: string,
    _reason?: string
  ): Promise<Review> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException("Review not found");
    }

    // Update status
    const [updated] = await this.db
      .update(reviews)
      .set({ status, updatedAt: new Date() })
      .where(eq(reviews.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Review with id ${id} not found`);
    }

    // If hiding a review, update summary
    if (status === "hidden" || (existing.status === "hidden" && status === "approved")) {
      await this.updateSummary(existing.targetType, existing.targetId);
    }

    return updated;
  }

  /**
   * Get pending reviews for moderation
   */
  async adminGetPendingReviews() {
    return this.db
      .select()
      .from(reviews)
      .where(eq(reviews.status, "pending"))
      .orderBy(desc(reviews.createdAt));
  }

  /**
   * Get reports filtered by status
   */
  async adminGetReports(status?: ReportStatus) {
    const conditions = status ? [eq(reviewReports.status, status)] : [];

    return this.db
      .select()
      .from(reviewReports)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reviewReports.createdAt));
  }

  /**
   * Hide a review (admin action)
   */
  async adminHideReview(reviewId: string, reason: string, adminId: string): Promise<void> {
    await this.adminUpdateStatus(reviewId, "hidden", adminId, reason);
  }
}
