import { tool } from "ai";
import { z } from "zod";
import { eq, and, desc, ilike } from "drizzle-orm";
import { communities, communityPosts } from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const communityTools = {
  "community.search": tool({
    description: "커뮤니티 검색. 이름으로 커뮤니티를 찾습니다.",
    parameters: z.object({
      query: z.string().describe("검색어"),
      limit: z.number().max(20).default(10),
    }),
    execute: async ({ query, limit }) => {
      const results = await db.query.communities.findMany({
        where: ilike(communities.name, `%${query}%`),
        limit,
        orderBy: [desc(communities.memberCount)],
        columns: {
          id: true,
          name: true,
          slug: true,
          description: true,
          memberCount: true,
        },
      });
      return results;
    },
  }),

  "community.posts": tool({
    description: "커뮤니티 게시글 조회. 특정 커뮤니티의 최신 게시글을 가져옵니다.",
    parameters: z.object({
      communityId: z.string().uuid().describe("커뮤니티 ID"),
      limit: z.number().max(20).default(10),
    }),
    execute: async ({ communityId, limit }) => {
      const posts = await db.query.communityPosts.findMany({
        where: and(
          eq(communityPosts.communityId, communityId),
          eq(communityPosts.status, "published"),
        ),
        limit,
        orderBy: [desc(communityPosts.createdAt)],
        columns: {
          id: true,
          title: true,
          type: true,
          upvoteCount: true,
          commentCount: true,
          createdAt: true,
        },
      });
      return posts;
    },
  }),
};
