import { tool } from "ai";
import { z } from "zod";
import { eq, and, desc, ilike } from "drizzle-orm";
import { boards, boardPosts } from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const boardTools = {
  "board.list": tool({
    description: "게시판 목록 조회",
    parameters: z.object({}),
    execute: async () => {
      const result = await db.query.boards.findMany({
        columns: { id: true, name: true, description: true, slug: true },
      });
      return result;
    },
  }),

  "board.postSearch": tool({
    description: "게시글 검색. 제목으로 게시글을 찾습니다.",
    parameters: z.object({
      query: z.string().describe("검색어"),
      boardId: z.string().uuid().optional().describe("특정 게시판 ID (선택)"),
      limit: z.number().max(20).default(10),
    }),
    execute: async ({ query, boardId, limit }) => {
      const conditions = [ilike(boardPosts.title, `%${query}%`)];
      if (boardId) conditions.push(eq(boardPosts.boardId, boardId));

      const posts = await db.query.boardPosts.findMany({
        where: and(...conditions),
        limit,
        orderBy: [desc(boardPosts.createdAt)],
        columns: { id: true, title: true, boardId: true, createdAt: true },
      });
      return posts;
    },
  }),
};
