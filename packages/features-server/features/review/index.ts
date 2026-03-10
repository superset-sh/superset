/**
 * Review Feature - Server
 *
 * Polymorphic review/rating system that can attach to any entity type
 * (board_post, product, content, course, etc.)
 *
 * Features:
 * - Review creation with rating (1-5), title, content, images
 * - Helpful voting system
 * - Abuse reporting
 * - Admin moderation
 * - Denormalized summaries for performance
 */

// Module
export { ReviewModule } from "./review.module";

// Controller
export { ReviewController } from "./controller";

// Service
export { ReviewService } from "./service";

// tRPC Router
export { reviewRouter, injectReviewService, type ReviewRouter } from "./trpc";

// Types
export type * from "./types";
