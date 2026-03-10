import { Injectable, Inject } from "@nestjs/common";
import { eq, and, count, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { reactions } from "@superbuilder/drizzle";
import type {
  ReactionType,
  ReactionCounts,
  ToggleReactionResult,
  UserReactionStatus,
} from "../types";

@Injectable()
export class ReactionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  /**
   * 리액션 토글
   */
  async toggle(
    targetType: string,
    targetId: string,
    userId: string,
    type: ReactionType = "like"
  ): Promise<ToggleReactionResult> {
    const [existing] = await this.db
      .select()
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, targetType),
          eq(reactions.targetId, targetId),
          eq(reactions.userId, userId),
          eq(reactions.type, type)
        )
      )
      .limit(1);

    if (existing) {
      // 리액션 제거
      await this.db.delete(reactions).where(eq(reactions.id, existing.id));
      return { added: false, type };
    }

    // 리액션 추가
    await this.db.insert(reactions).values({
      targetType,
      targetId,
      userId,
      type,
    });

    return { added: true, type };
  }

  /**
   * 타입별 리액션 카운트 조회
   */
  async getReactionCounts(
    targetType: string,
    targetId: string
  ): Promise<ReactionCounts> {
    const results = await this.db
      .select({
        type: reactions.type,
        count: count(),
      })
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, targetType),
          eq(reactions.targetId, targetId)
        )
      )
      .groupBy(reactions.type);

    const byType = results.map((r) => ({
      type: r.type as ReactionType,
      count: Number(r.count),
    }));

    const total = byType.reduce((sum, r) => sum + r.count, 0);

    return { total, byType };
  }

  /**
   * 여러 대상의 리액션 카운트 일괄 조회
   */
  async getReactionCountsBatch(
    targetType: string,
    targetIds: string[]
  ): Promise<Map<string, ReactionCounts>> {
    if (targetIds.length === 0) {
      return new Map();
    }

    const results = await this.db
      .select({
        targetId: reactions.targetId,
        type: reactions.type,
        count: count(),
      })
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, targetType),
          inArray(reactions.targetId, targetIds)
        )
      )
      .groupBy(reactions.targetId, reactions.type);

    const countsMap = new Map<string, ReactionCounts>();

    // 초기화
    for (const id of targetIds) {
      countsMap.set(id, { total: 0, byType: [] });
    }

    // 결과 집계
    for (const r of results) {
      const existing = countsMap.get(r.targetId) ?? { total: 0, byType: [] };
      existing.byType.push({
        type: r.type as ReactionType,
        count: Number(r.count),
      });
      existing.total += Number(r.count);
      countsMap.set(r.targetId, existing);
    }

    return countsMap;
  }

  /**
   * 사용자 리액션 상태 조회
   */
  async getUserReactionStatus(
    targetType: string,
    targetId: string,
    userId: string
  ): Promise<UserReactionStatus> {
    const userReactions = await this.db
      .select({ type: reactions.type })
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, targetType),
          eq(reactions.targetId, targetId),
          eq(reactions.userId, userId)
        )
      );

    return {
      hasReacted: userReactions.length > 0,
      types: userReactions.map((r) => r.type as ReactionType),
    };
  }

  /**
   * 여러 대상의 사용자 리액션 상태 일괄 조회
   */
  async getUserReactionStatusBatch(
    targetType: string,
    targetIds: string[],
    userId: string
  ): Promise<Map<string, UserReactionStatus>> {
    if (targetIds.length === 0) {
      return new Map();
    }

    const results = await this.db
      .select({
        targetId: reactions.targetId,
        type: reactions.type,
      })
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, targetType),
          eq(reactions.userId, userId),
          inArray(reactions.targetId, targetIds)
        )
      );

    const statusMap = new Map<string, UserReactionStatus>();

    // 초기화
    for (const id of targetIds) {
      statusMap.set(id, { hasReacted: false, types: [] });
    }

    // 결과 집계
    for (const r of results) {
      const existing = statusMap.get(r.targetId) ?? {
        hasReacted: false,
        types: [],
      };
      existing.hasReacted = true;
      existing.types.push(r.type as ReactionType);
      statusMap.set(r.targetId, existing);
    }

    return statusMap;
  }

  /**
   * 대상의 모든 리액션 삭제 (대상 삭제 시 호출)
   */
  async deleteAllForTarget(targetType: string, targetId: string): Promise<void> {
    await this.db
      .delete(reactions)
      .where(
        and(
          eq(reactions.targetType, targetType),
          eq(reactions.targetId, targetId)
        )
      );
  }
}
