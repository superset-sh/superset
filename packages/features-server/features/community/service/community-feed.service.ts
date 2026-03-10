import { Injectable, Inject } from "@nestjs/common";
import { eq, desc, and, inArray, sql, gte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  communityPosts,
  communityMemberships,
  communities,
  type CommunityPost,
} from "@superbuilder/drizzle";

export interface FeedOptions {
  sort?: "hot" | "new" | "top" | "rising" | "controversial";
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  page?: number;
  limit?: number;
}

@Injectable()
export class CommunityFeedService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>) {}

  /**
   * 홈 피드 (구독한 커뮤니티)
   */
  async getHomeFeed(userId: string, options: FeedOptions = {}) {
    // 구독한 커뮤니티 ID 조회
    const memberships = await this.db
      .select({ communityId: communityMemberships.communityId })
      .from(communityMemberships)
      .where(eq(communityMemberships.userId, userId));

    const communityIds = memberships.map((m) => m.communityId);

    if (communityIds.length === 0) {
      return {
        items: [],
        total: 0,
        page: 1,
        limit: options.limit ?? 25,
        hasMore: false,
      };
    }

    return this.getFeed(options, communityIds);
  }

  /**
   * 전체 피드 (모든 공개 커뮤니티)
   */
  async getAllFeed(options: FeedOptions = {}) {
    // 공개 커뮤니티 ID 조회
    const publicCommunities = await this.db
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.type, "public"));

    const communityIds = publicCommunities.map((c) => c.id);

    return this.getFeed(options, communityIds);
  }

  /**
   * 인기 피드
   */
  async getPopularFeed(options: FeedOptions = {}) {
    const limit = options.limit ?? 25;
    const timeFilter = options.timeFilter ?? "day";

    // 시간 필터
    let startDate = new Date();
    switch (timeFilter) {
      case "hour":
        startDate = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case "day":
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }

    const items = await this.db
      .select()
      .from(communityPosts)
      .where(
        and(
          eq(communityPosts.status, "published"),
          gte(communityPosts.createdAt, startDate)
        )
      )
      .orderBy(desc(communityPosts.voteScore))
      .limit(limit);

    return items as CommunityPost[];
  }

  /**
   * 공통 피드 로직
   */
  private async getFeed(options: FeedOptions, communityIds: string[]) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 25;
    const offset = (page - 1) * limit;

    let query = this.db
      .select({
        post: communityPosts,
        communitySlug: communities.slug,
      })
      .from(communityPosts)
      .leftJoin(communities, eq(communityPosts.communityId, communities.id))
      .where(
        and(
          eq(communityPosts.status, "published"),
          inArray(communityPosts.communityId, communityIds)
        )
      ) as any;

    // 시간 필터
    if (options.timeFilter && options.timeFilter !== "all") {
      let startDate: Date;
      switch (options.timeFilter) {
        case "hour":
          startDate = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case "day":
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case "week":
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "year":
          startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0);
      }

      query = (query as any).where(
        and(
          eq(communityPosts.status, "published"),
          inArray(communityPosts.communityId, communityIds),
          gte(communityPosts.createdAt, startDate)
        )
      );
    }

    // 정렬
    switch (options.sort) {
      case "hot":
        query = (query as any).orderBy(desc(communityPosts.hotScore));
        break;
      case "top":
        query = (query as any).orderBy(desc(communityPosts.voteScore));
        break;
      case "rising":
        query = (query as any)
          .where(
            and(
              eq(communityPosts.status, "published"),
              inArray(communityPosts.communityId, communityIds),
              gte(communityPosts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
            )
          )
          .orderBy(
            desc(
              sql`${communityPosts.voteScore} / EXTRACT(EPOCH FROM (NOW() - ${communityPosts.createdAt}))`
            )
          );
        break;
      case "controversial":
        query = (query as any).orderBy(
          desc(
            sql`(${communityPosts.upvoteCount} + ${communityPosts.downvoteCount}) * LEAST(${communityPosts.upvoteCount}::float / NULLIF(${communityPosts.downvoteCount}, 0), ${communityPosts.downvoteCount}::float / NULLIF(${communityPosts.upvoteCount}, 0))`
          )
        );
        break;
      case "new":
      default:
        query = (query as any).orderBy(desc(communityPosts.createdAt));
    }

    const results = await query.limit(limit).offset(offset);

    // Flatten post and add communitySlug
    const items = results.map((r: any) => ({
      ...r.post,
      communitySlug: r.communitySlug,
    }));

    return {
      items,
      total: items.length,
      page,
      limit,
      hasMore: items.length === limit,
    };
  }
}
