/**
 * Community tRPC Routers
 */
import type { RateLimitService } from "../../../core/rate-limit";
import { createServiceContainer, router } from "../../../core/trpc";
import type {
  CommunityCommentService,
  CommunityFeedService,
  CommunityKarmaService,
  CommunityModerationService,
  CommunityPostService,
  CommunityService,
  CommunityVoteService,
} from "../service";
import { communityAdminRouter } from "./admin.route";
import { commentRouter } from "./comment.route";
import { communityRouter } from "./community.route";
import { feedRouter } from "./feed.route";
import { karmaRouter } from "./karma.route";
import { moderationRouter } from "./moderation.route";
import { postRouter } from "./post.route";
import { voteRouter } from "./vote.route";

// ============================================================================
// Shared Service Container
// ============================================================================

const services = createServiceContainer<{
  communityService: CommunityService;
  postService: CommunityPostService;
  commentService: CommunityCommentService;
  voteService: CommunityVoteService;
  karmaService: CommunityKarmaService;
  moderationService: CommunityModerationService;
  feedService: CommunityFeedService;
  rateLimitService: RateLimitService;
}>();

export const getCommunityServices = services.get;
export const injectCommunityServices = services.inject;

// 통합 라우터
export const communityMainRouter = router({
  community: communityRouter,
  post: postRouter,
  comment: commentRouter,
  vote: voteRouter,
  karma: karmaRouter,
  moderation: moderationRouter,
  feed: feedRouter,
  admin: communityAdminRouter,
});

export type CommunityMainRouter = typeof communityMainRouter;
