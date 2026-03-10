import { Injectable, Inject } from "@nestjs/common";
import { eq, and, desc, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { bookmarks } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import type { ToggleBookmarkResult, BookmarkItem } from "../types";

const logger = createLogger("bookmark");

@Injectable()
export class BookmarkService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  /**
   * 북마크 토글
   */
  async toggle(
    targetType: string,
    targetId: string,
    userId: string,
  ): Promise<ToggleBookmarkResult> {
    const [existing] = await this.db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.targetType, targetType),
          eq(bookmarks.targetId, targetId),
          eq(bookmarks.userId, userId),
        )
      )
      .limit(1);

    if (existing) {
      await this.db.delete(bookmarks).where(eq(bookmarks.id, existing.id));
      logger.info("Bookmark removed", {
        "bookmark.target_type": targetType,
        "bookmark.target_id": targetId,
        "user.id": userId,
      });
      return { added: false };
    }

    await this.db.insert(bookmarks).values({
      targetType,
      targetId,
      userId,
    });

    logger.info("Bookmark added", {
      "bookmark.target_type": targetType,
      "bookmark.target_id": targetId,
      "user.id": userId,
    });

    return { added: true };
  }

  /**
   * 북마크 여부 조회
   */
  async isBookmarked(
    targetType: string,
    targetId: string,
    userId: string,
  ): Promise<boolean> {
    const [existing] = await this.db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.targetType, targetType),
          eq(bookmarks.targetId, targetId),
          eq(bookmarks.userId, userId),
        )
      )
      .limit(1);

    return !!existing;
  }

  /**
   * 여러 대상 북마크 여부 일괄 조회
   */
  async isBookmarkedBatch(
    targetType: string,
    targetIds: string[],
    userId: string,
  ): Promise<Map<string, boolean>> {
    if (targetIds.length === 0) {
      return new Map();
    }

    const results = await this.db
      .select({ targetId: bookmarks.targetId })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.targetType, targetType),
          eq(bookmarks.userId, userId),
          inArray(bookmarks.targetId, targetIds),
        )
      );

    const statusMap = new Map<string, boolean>();
    for (const id of targetIds) {
      statusMap.set(id, false);
    }
    for (const r of results) {
      statusMap.set(r.targetId, true);
    }

    return statusMap;
  }

  /**
   * 내 북마크 목록 조회
   */
  async getMyBookmarks(
    userId: string,
    targetType?: string,
  ): Promise<BookmarkItem[]> {
    const conditions = [eq(bookmarks.userId, userId)];
    if (targetType) {
      conditions.push(eq(bookmarks.targetType, targetType));
    }

    const results = await this.db
      .select({
        id: bookmarks.id,
        targetType: bookmarks.targetType,
        targetId: bookmarks.targetId,
        createdAt: bookmarks.createdAt,
      })
      .from(bookmarks)
      .where(and(...conditions))
      .orderBy(desc(bookmarks.createdAt));

    return results;
  }

  /**
   * 대상의 모든 북마크 삭제 (대상 삭제 시 호출)
   */
  async deleteAllForTarget(targetType: string, targetId: string): Promise<void> {
    await this.db
      .delete(bookmarks)
      .where(
        and(
          eq(bookmarks.targetType, targetType),
          eq(bookmarks.targetId, targetId),
        )
      );
  }
}
