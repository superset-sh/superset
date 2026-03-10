import { authProcedure, getAuthUserId, router } from "../../../core/trpc";
import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { bookmarks } from "@superbuilder/drizzle";

// Input schemas
const toggleBookmarkSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().uuid(),
});

const getBookmarkSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().uuid(),
});

const getBookmarkBatchSchema = z.object({
  targetType: z.string().min(1),
  targetIds: z.array(z.string().uuid()),
});

const myBookmarksSchema = z.object({
  targetType: z.string().min(1).optional(),
});

export const bookmarkRouter = router({
  /**
   * 북마크 토글
   */
  toggle: authProcedure
    .input(toggleBookmarkSchema)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const userId = getAuthUserId(ctx);

      const [existing] = await db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.targetType, input.targetType),
            eq(bookmarks.targetId, input.targetId),
            eq(bookmarks.userId, userId),
          ),
        )
        .limit(1);

      if (existing) {
        await db.delete(bookmarks).where(eq(bookmarks.id, existing.id));
        return { added: false };
      }

      await db.insert(bookmarks).values({
        targetType: input.targetType,
        targetId: input.targetId,
        userId,
      });

      return { added: true };
    }),

  /**
   * 북마크 여부 조회
   */
  isBookmarked: authProcedure
    .input(getBookmarkSchema)
    .query(async ({ ctx, input }): Promise<boolean> => {
      const db = ctx.db;
      const userId = getAuthUserId(ctx);

      const [existing] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.targetType, input.targetType),
            eq(bookmarks.targetId, input.targetId),
            eq(bookmarks.userId, userId),
          ),
        )
        .limit(1);

      return !!existing;
    }),

  /**
   * 여러 대상 북마크 여부 일괄 조회
   */
  isBookmarkedBatch: authProcedure
    .input(getBookmarkBatchSchema)
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const userId = getAuthUserId(ctx);
      const { targetType, targetIds } = input;

      if (targetIds.length === 0) {
        return {};
      }

      const results = await db
        .select({ targetId: bookmarks.targetId })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.targetType, targetType),
            eq(bookmarks.userId, userId),
            inArray(bookmarks.targetId, targetIds),
          ),
        );

      const statusMap: Record<string, boolean> = {};
      for (const id of targetIds) {
        statusMap[id] = false;
      }
      for (const r of results) {
        statusMap[r.targetId] = true;
      }

      return statusMap;
    }),

  /**
   * 내 북마크 목록 조회
   */
  myList: authProcedure
    .input(myBookmarksSchema)
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const userId = getAuthUserId(ctx);

      const conditions = [eq(bookmarks.userId, userId)];
      if (input.targetType) {
        conditions.push(eq(bookmarks.targetType, input.targetType));
      }

      return db
        .select({
          id: bookmarks.id,
          targetType: bookmarks.targetType,
          targetId: bookmarks.targetId,
          createdAt: bookmarks.createdAt,
        })
        .from(bookmarks)
        .where(and(...conditions))
        .orderBy(desc(bookmarks.createdAt));
    }),
});

export type BookmarkRouter = typeof bookmarkRouter;
