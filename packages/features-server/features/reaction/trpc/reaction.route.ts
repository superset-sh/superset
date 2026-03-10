import { publicProcedure, authProcedure, getAuthUserId, router } from "../../../core/trpc";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ReactionCounts, ReactionType, UserReactionStatus } from "../types";
import { reactions } from "@superbuilder/drizzle";

// Input schemas
const toggleReactionSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().uuid(),
  type: z.enum(["like", "love", "haha", "wow", "sad", "angry"]).optional().default("like"),
});

const getReactionSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().uuid(),
});

const getReactionBatchSchema = z.object({
  targetType: z.string().min(1),
  targetIds: z.array(z.string().uuid()),
});

export const reactionRouter = router({
  /**
   * 리액션 토글
   */
  toggle: authProcedure
    .input(toggleReactionSchema)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const userId = getAuthUserId(ctx);

      const [existing] = await db
        .select()
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, input.targetType),
            eq(reactions.targetId, input.targetId),
            eq(reactions.userId, userId),
            eq(reactions.type, input.type),
          ),
        )
        .limit(1);

      if (existing) {
        await db.delete(reactions).where(eq(reactions.id, existing.id));
        return { added: false, type: input.type };
      }

      await db.insert(reactions).values({
        targetType: input.targetType,
        targetId: input.targetId,
        userId,
        type: input.type,
      });

      return { added: true, type: input.type };
    }),

  /**
   * 리액션 카운트 조회
   */
  getCounts: publicProcedure
    .input(getReactionSchema)
    .query(async ({ ctx, input }): Promise<ReactionCounts> => {
      const db = ctx.db;

      const results = await db
        .select({
          type: reactions.type,
          count: count(),
        })
        .from(reactions)
        .where(
          and(eq(reactions.targetType, input.targetType), eq(reactions.targetId, input.targetId)),
        )
        .groupBy(reactions.type);

      const byType = results.map((r) => ({
        type: r.type as ReactionType,
        count: Number(r.count),
      }));

      const total = byType.reduce((sum, r) => sum + r.count, 0);

      return { total, byType };
    }),

  /**
   * 여러 대상 리액션 카운트 일괄 조회
   */
  getCountsBatch: publicProcedure.input(getReactionBatchSchema).query(async ({ ctx, input }) => {
    const db = ctx.db;
    const { targetType, targetIds } = input;

    if (targetIds.length === 0) {
      return {};
    }

    const results = await db
      .select({
        targetId: reactions.targetId,
        type: reactions.type,
        count: count(),
      })
      .from(reactions)
      .where(
        and(eq(reactions.targetType, targetType), sql`${reactions.targetId} = ANY(${targetIds})`),
      )
      .groupBy(reactions.targetId, reactions.type);

    const countsMap: Record<string, ReactionCounts> = {};

    // 초기화
    for (const id of targetIds) {
      countsMap[id] = { total: 0, byType: [] };
    }

    // 결과 집계
    for (const r of results) {
      const entry = countsMap[r.targetId] ?? { total: 0, byType: [] };
      entry.byType.push({
        type: r.type as ReactionType,
        count: Number(r.count),
      });
      entry.total += Number(r.count);
      countsMap[r.targetId] = entry;
    }

    return countsMap;
  }),

  /**
   * 사용자 리액션 상태 조회
   */
  getUserStatus: authProcedure
    .input(getReactionSchema)
    .query(async ({ ctx, input }): Promise<UserReactionStatus> => {
      const db = ctx.db;
      const userId = getAuthUserId(ctx);

      const userReactions = await db
        .select({ type: reactions.type })
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, input.targetType),
            eq(reactions.targetId, input.targetId),
            eq(reactions.userId, userId),
          ),
        );

      return {
        hasReacted: userReactions.length > 0,
        types: userReactions.map((r) => r.type as ReactionType),
      };
    }),

  /**
   * 여러 대상 사용자 리액션 상태 일괄 조회
   */
  getUserStatusBatch: authProcedure
    .input(getReactionBatchSchema)
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const userId = getAuthUserId(ctx);
      const { targetType, targetIds } = input;

      if (targetIds.length === 0) {
        return {};
      }

      const results = await db
        .select({
          targetId: reactions.targetId,
          type: reactions.type,
        })
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, targetType),
            eq(reactions.userId, userId),
            sql`${reactions.targetId} = ANY(${targetIds})`,
          ),
        );

      const statusMap: Record<string, UserReactionStatus> = {};

      // 초기화
      for (const id of targetIds) {
        statusMap[id] = { hasReacted: false, types: [] };
      }

      // 결과 집계
      for (const r of results) {
        const entry = statusMap[r.targetId] ?? { hasReacted: false, types: [] };
        entry.hasReacted = true;
        entry.types.push(r.type as ReactionType);
        statusMap[r.targetId] = entry;
      }

      return statusMap;
    }),
});

export type ReactionRouter = typeof reactionRouter;
