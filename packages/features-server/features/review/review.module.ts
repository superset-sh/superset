import { Module, OnModuleInit } from "@nestjs/common";
import { ReviewController } from "./controller/review.controller";
import { ReviewService } from "./service/review.service";
import { injectReviewService } from "./trpc/review.route";

/**
 * Review Feature Module
 *
 * Provides polymorphic review/rating system for any entity type.
 * Includes helpful voting, reporting, and admin moderation.
 */
@Module({
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule implements OnModuleInit {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * Inject service into tRPC router on module initialization
   */
  onModuleInit() {
    injectReviewService(this.reviewService);
  }
}
