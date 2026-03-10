import { Module, OnModuleInit } from "@nestjs/common";
import {
  CommunityService,
  CommunityPostService,
  CommunityCommentService,
  CommunityVoteService,
  CommunityKarmaService,
  CommunityModerationService,
  CommunityFeedService,
} from "./service";
import { CommunityController, CommunityAdminController } from "./controller";
import { RateLimitService } from "../../core/rate-limit";
import { injectCommunityServices } from "./trpc";

/**
 * Community Feature Module
 *
 * Reddit-style user-driven community platform with posts, comments,
 * voting, moderation, and feed algorithms.
 */
@Module({
  controllers: [CommunityController, CommunityAdminController],
  providers: [
    CommunityService,
    CommunityPostService,
    CommunityCommentService,
    CommunityVoteService,
    CommunityKarmaService,
    CommunityModerationService,
    CommunityFeedService,
    RateLimitService,
  ],
  exports: [
    CommunityService,
    CommunityPostService,
    CommunityCommentService,
    CommunityVoteService,
    CommunityKarmaService,
    CommunityModerationService,
    CommunityFeedService,
  ],
})
export class CommunityModule implements OnModuleInit {
  constructor(
    private readonly communityService: CommunityService,
    private readonly postService: CommunityPostService,
    private readonly commentService: CommunityCommentService,
    private readonly voteService: CommunityVoteService,
    private readonly karmaService: CommunityKarmaService,
    private readonly moderationService: CommunityModerationService,
    private readonly feedService: CommunityFeedService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  /**
   * Inject services into tRPC routers on module initialization
   */
  onModuleInit() {
    injectCommunityServices({
      communityService: this.communityService,
      postService: this.postService,
      commentService: this.commentService,
      voteService: this.voteService,
      karmaService: this.karmaService,
      moderationService: this.moderationService,
      feedService: this.feedService,
      rateLimitService: this.rateLimitService,
    });
  }
}
