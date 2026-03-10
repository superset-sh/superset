import { Injectable, Inject, NotFoundException, ForbiddenException } from "@nestjs/common";
import { DRIZZLE } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import {
  eq,
  and,
  desc,
  count,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  studioStudios,
  studioTopics,
  studioContents,
  studioContentSeo,
  studioContentAnalysis,
  studioEdges,
  studioRecurrences,
} from "@superbuilder/drizzle";
import { profiles } from "@superbuilder/drizzle";

@Injectable()
export class ContentStudioService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB
  ) {}

  // ========================================
  // Studio CRUD
  // ========================================

  /** 스튜디오 목록 조회 */
  async findStudios(userId?: string) {
    const conditions: SQL[] = [eq(studioStudios.isDeleted, false)];

    if (userId) {
      conditions.push(eq(studioStudios.ownerId, userId));
    }

    const result = await this.db
      .select({
        id: studioStudios.id,
        title: studioStudios.title,
        description: studioStudios.description,
        ownerId: studioStudios.ownerId,
        visibility: studioStudios.visibility,
        createdAt: studioStudios.createdAt,
        updatedAt: studioStudios.updatedAt,
        isDeleted: studioStudios.isDeleted,
        deletedAt: studioStudios.deletedAt,
        ownerName: profiles.name,
        ownerAvatar: profiles.avatar,
      })
      .from(studioStudios)
      .leftJoin(profiles, eq(studioStudios.ownerId, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(studioStudios.updatedAt));

    return result;
  }

  /** 스튜디오 상세 + 모든 노드/엣지 (캔버스 데이터) */
  async getCanvasData(studioId: string, userId?: string) {
    const studio = await this.db
      .select()
      .from(studioStudios)
      .where(and(eq(studioStudios.id, studioId), eq(studioStudios.isDeleted, false)))
      .then((rows) => rows[0]);

    if (!studio) throw new NotFoundException("스튜디오를 찾을 수 없습니다");

    // 권한 체크: private 스튜디오는 소유자만 접근
    if (studio.visibility === "private" && studio.ownerId !== userId) {
      throw new ForbiddenException("접근 권한이 없습니다");
    }

    const [topics, contents, edges] = await Promise.all([
      this.db
        .select()
        .from(studioTopics)
        .where(eq(studioTopics.studioId, studioId))
        .orderBy(studioTopics.createdAt),
      this.db
        .select({
          id: studioContents.id,
          studioId: studioContents.studioId,
          topicId: studioContents.topicId,
          title: studioContents.title,
          content: studioContents.content,
          summary: studioContents.summary,
          thumbnailUrl: studioContents.thumbnailUrl,
          status: studioContents.status,
          scheduledAt: studioContents.scheduledAt,
          label: studioContents.label,
          positionX: studioContents.positionX,
          positionY: studioContents.positionY,
          viewCount: studioContents.viewCount,
          authorId: studioContents.authorId,
          publishedAt: studioContents.publishedAt,
          createdAt: studioContents.createdAt,
          updatedAt: studioContents.updatedAt,
          isDeleted: studioContents.isDeleted,
          deletedAt: studioContents.deletedAt,
          derivedFromId: studioContents.derivedFromId,
          repurposeFormat: studioContents.repurposeFormat,
          authorName: profiles.name,
          authorAvatar: profiles.avatar,
          topicLabel: studioTopics.label,
        })
        .from(studioContents)
        .leftJoin(profiles, eq(studioContents.authorId, profiles.id))
        .leftJoin(studioTopics, eq(studioContents.topicId, studioTopics.id))
        .where(
          and(
            eq(studioContents.studioId, studioId),
            eq(studioContents.isDeleted, false)
          )
        )
        .orderBy(studioContents.createdAt),
      this.db
        .select()
        .from(studioEdges)
        .where(eq(studioEdges.studioId, studioId)),
    ]);

    return { studio, topics, contents, edges };
  }

  /** 스튜디오 생성 */
  async createStudio(
    input: { title: string; description?: string; visibility?: "public" | "private" },
    ownerId: string
  ) {
    const [studio] = await this.db
      .insert(studioStudios)
      .values({ ...input, ownerId })
      .returning();
    return studio!;
  }

  /** 스튜디오 수정 */
  async updateStudio(
    studioId: string,
    input: { title?: string; description?: string | null; visibility?: "public" | "private" },
    userId: string
  ) {
    await this.assertStudioOwner(studioId, userId);
    const [updated] = await this.db
      .update(studioStudios)
      .set(input)
      .where(eq(studioStudios.id, studioId))
      .returning();
    return updated!;
  }

  /** 스튜디오 삭제 (soft delete) */
  async deleteStudio(studioId: string, userId: string) {
    await this.assertStudioOwner(studioId, userId);
    await this.db
      .update(studioStudios)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(studioStudios.id, studioId));
    return { success: true };
  }

  // ========================================
  // Topic CRUD
  // ========================================

  async createTopic(
    input: { studioId: string; label: string; color?: string; positionX?: number; positionY?: number },
    userId: string
  ) {
    await this.assertStudioOwner(input.studioId, userId);
    const [topic] = await this.db
      .insert(studioTopics)
      .values(input)
      .returning();
    return topic!;
  }

  async updateTopic(
    topicId: string,
    input: { label?: string; color?: string | null; positionX?: number; positionY?: number },
    userId: string
  ) {
    const topic = await this.db.select().from(studioTopics).where(eq(studioTopics.id, topicId)).then((r) => r[0]);
    if (!topic) throw new NotFoundException("주제를 찾을 수 없습니다");
    await this.assertStudioOwner(topic.studioId, userId);

    const [updated] = await this.db
      .update(studioTopics)
      .set(input)
      .where(eq(studioTopics.id, topicId))
      .returning();
    return updated!;
  }

  async deleteTopic(topicId: string, userId: string) {
    const topic = await this.db.select().from(studioTopics).where(eq(studioTopics.id, topicId)).then((r) => r[0]);
    if (!topic) throw new NotFoundException("주제를 찾을 수 없습니다");
    await this.assertStudioOwner(topic.studioId, userId);

    // 연결된 콘텐츠의 topicId를 null로 변경
    await this.db
      .update(studioContents)
      .set({ topicId: null })
      .where(eq(studioContents.topicId, topicId));

    // 관련 엣지 삭제
    await this.db
      .delete(studioEdges)
      .where(
        and(
          eq(studioEdges.studioId, topic.studioId),
          sql`(${studioEdges.sourceId} = ${topicId} OR ${studioEdges.targetId} = ${topicId})`
        )
      );

    await this.db.delete(studioTopics).where(eq(studioTopics.id, topicId));
    return { success: true };
  }

  // ========================================
  // Content CRUD
  // ========================================

  async createContent(
    input: {
      studioId: string;
      topicId?: string;
      title: string;
      content?: string;
      positionX?: number;
      positionY?: number;
    },
    authorId: string
  ) {
    await this.assertStudioOwner(input.studioId, authorId);
    const [content] = await this.db
      .insert(studioContents)
      .values({ ...input, authorId })
      .returning();
    return content!;
  }

  async getContent(contentId: string) {
    const result = await this.db
      .select({
        id: studioContents.id,
        studioId: studioContents.studioId,
        topicId: studioContents.topicId,
        title: studioContents.title,
        content: studioContents.content,
        summary: studioContents.summary,
        thumbnailUrl: studioContents.thumbnailUrl,
        status: studioContents.status,
        positionX: studioContents.positionX,
        positionY: studioContents.positionY,
        viewCount: studioContents.viewCount,
        authorId: studioContents.authorId,
        publishedAt: studioContents.publishedAt,
        createdAt: studioContents.createdAt,
        updatedAt: studioContents.updatedAt,
        slug: studioContents.slug,
        isDeleted: studioContents.isDeleted,
        deletedAt: studioContents.deletedAt,
        authorName: profiles.name,
        authorAvatar: profiles.avatar,
        topicLabel: studioTopics.label,
      })
      .from(studioContents)
      .leftJoin(profiles, eq(studioContents.authorId, profiles.id))
      .leftJoin(studioTopics, eq(studioContents.topicId, studioTopics.id))
      .where(and(eq(studioContents.id, contentId), eq(studioContents.isDeleted, false)))
      .then((r) => r[0]);

    if (!result) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");

    // 최신 SEO 스냅샷 조회
    const latestSeo = await this.db
      .select({
        seoTitle: studioContentSeo.seoTitle,
        seoDescription: studioContentSeo.seoDescription,
        seoKeywords: studioContentSeo.seoKeywords,
      })
      .from(studioContentSeo)
      .where(eq(studioContentSeo.contentId, contentId))
      .orderBy(desc(studioContentSeo.createdAt))
      .limit(1)
      .then((r) => r[0]);

    return {
      ...result,
      seoTitle: latestSeo?.seoTitle ?? null,
      seoDescription: latestSeo?.seoDescription ?? null,
      seoKeywords: latestSeo?.seoKeywords ?? [],
    };
  }

  async updateContent(
    contentId: string,
    input: {
      title?: string;
      content?: string;
      summary?: string;
      thumbnailUrl?: string | null;
      status?: "draft" | "writing" | "review" | "published" | "canceled";
      topicId?: string | null;
      positionX?: number;
      positionY?: number;
      scheduledAt?: Date | null;
      label?: string | null;
      slug?: string | null;
    },
    userId: string
  ) {
    const content = await this.db.select().from(studioContents).where(eq(studioContents.id, contentId)).then((r) => r[0]);
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");
    await this.assertStudioOwner(content.studioId, userId);

    const updateData: Record<string, unknown> = { ...input };
    if (input.status === "published" && content.status !== "published") {
      updateData.publishedAt = new Date();
    }

    const [updated] = await this.db
      .update(studioContents)
      .set(updateData)
      .where(eq(studioContents.id, contentId))
      .returning();
    return updated!;
  }

  async deleteContent(contentId: string, userId: string) {
    const content = await this.db.select().from(studioContents).where(eq(studioContents.id, contentId)).then((r) => r[0]);
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");
    await this.assertStudioOwner(content.studioId, userId);

    // 관련 엣지 삭제
    await this.db
      .delete(studioEdges)
      .where(
        and(
          eq(studioEdges.studioId, content.studioId),
          sql`(${studioEdges.sourceId} = ${contentId} OR ${studioEdges.targetId} = ${contentId})`
        )
      );

    await this.db
      .update(studioContents)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(studioContents.id, contentId));
    return { success: true };
  }

  /** 노드 위치 일괄 업데이트 (캔버스 드래그) */
  async updateNodePositions(
    updates: Array<{ id: string; type: "topic" | "content"; positionX: number; positionY: number }>,
    _userId: string
  ) {
    for (const u of updates) {
      if (u.type === "topic") {
        await this.db.update(studioTopics).set({ positionX: u.positionX, positionY: u.positionY }).where(eq(studioTopics.id, u.id));
      } else {
        await this.db.update(studioContents).set({ positionX: u.positionX, positionY: u.positionY }).where(eq(studioContents.id, u.id));
      }
    }
    return { success: true };
  }

  // ========================================
  // Edge CRUD
  // ========================================

  async createEdge(
    input: {
      studioId: string;
      sourceId: string;
      sourceType: "topic" | "content";
      targetId: string;
      targetType: "topic" | "content";
    },
    userId: string
  ) {
    await this.assertStudioOwner(input.studioId, userId);
    const [edge] = await this.db.insert(studioEdges).values(input).returning();
    return edge!;
  }

  async deleteEdge(edgeId: string, userId: string) {
    const edge = await this.db.select().from(studioEdges).where(eq(studioEdges.id, edgeId)).then((r) => r[0]);
    if (!edge) throw new NotFoundException("엣지를 찾을 수 없습니다");
    await this.assertStudioOwner(edge.studioId, userId);
    await this.db.delete(studioEdges).where(eq(studioEdges.id, edgeId));
    return { success: true };
  }

  // ========================================
  // Calendar
  // ========================================

  /** 월별 콘텐츠 조회 (scheduledAt 또는 publishedAt 기준) */
  async getCalendarContents(studioId: string, year: number, month: number, userId: string) {
    await this.assertStudioOwner(studioId, userId);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return this.db
      .select({
        id: studioContents.id,
        title: studioContents.title,
        status: studioContents.status,
        label: studioContents.label,
        scheduledAt: studioContents.scheduledAt,
        publishedAt: studioContents.publishedAt,
        createdAt: studioContents.createdAt,
      })
      .from(studioContents)
      .where(
        and(
          eq(studioContents.studioId, studioId),
          eq(studioContents.isDeleted, false),
          sql`(
            (${studioContents.scheduledAt} >= ${startDate} AND ${studioContents.scheduledAt} <= ${endDate})
            OR
            (${studioContents.scheduledAt} IS NULL AND ${studioContents.publishedAt} >= ${startDate} AND ${studioContents.publishedAt} <= ${endDate})
          )`
        )
      )
      .orderBy(studioContents.scheduledAt, studioContents.publishedAt);
  }

  /** 콘텐츠에 scheduledAt 설정 */
  async scheduleContent(contentId: string, scheduledAt: Date, userId: string) {
    const content = await this.db.select().from(studioContents).where(eq(studioContents.id, contentId)).then((r) => r[0]);
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");
    await this.assertStudioOwner(content.studioId, userId);

    const [updated] = await this.db
      .update(studioContents)
      .set({ scheduledAt })
      .where(eq(studioContents.id, contentId))
      .returning();
    return updated!;
  }

  /** scheduledAt 제거 */
  async unscheduleContent(contentId: string, userId: string) {
    const content = await this.db.select().from(studioContents).where(eq(studioContents.id, contentId)).then((r) => r[0]);
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");
    await this.assertStudioOwner(content.studioId, userId);

    const [updated] = await this.db
      .update(studioContents)
      .set({ scheduledAt: null })
      .where(eq(studioContents.id, contentId))
      .returning();
    return updated!;
  }

  // ========================================
  // Recurrence
  // ========================================

  /** 반복 규칙 목록 */
  async findRecurrences(studioId: string, userId: string) {
    await this.assertStudioOwner(studioId, userId);
    return this.db
      .select()
      .from(studioRecurrences)
      .where(eq(studioRecurrences.studioId, studioId))
      .orderBy(studioRecurrences.createdAt);
  }

  /** 반복 규칙 생성 */
  async createRecurrence(
    input: {
      studioId: string;
      title: string;
      rule: string;
      templateContentId?: string;
      label?: string;
      nextRunAt?: Date;
    },
    userId: string
  ) {
    await this.assertStudioOwner(input.studioId, userId);
    const [recurrence] = await this.db
      .insert(studioRecurrences)
      .values({ ...input, createdBy: userId })
      .returning();
    return recurrence!;
  }

  /** 반복 규칙 수정 */
  async updateRecurrence(
    recurrenceId: string,
    input: {
      title?: string;
      rule?: string;
      templateContentId?: string | null;
      label?: string | null;
      nextRunAt?: Date | null;
    },
    userId: string
  ) {
    const recurrence = await this.db.select().from(studioRecurrences).where(eq(studioRecurrences.id, recurrenceId)).then((r) => r[0]);
    if (!recurrence) throw new NotFoundException("반복 규칙을 찾을 수 없습니다");
    await this.assertStudioOwner(recurrence.studioId, userId);

    const [updated] = await this.db
      .update(studioRecurrences)
      .set(input)
      .where(eq(studioRecurrences.id, recurrenceId))
      .returning();
    return updated!;
  }

  /** 반복 규칙 삭제 */
  async deleteRecurrence(recurrenceId: string, userId: string) {
    const recurrence = await this.db.select().from(studioRecurrences).where(eq(studioRecurrences.id, recurrenceId)).then((r) => r[0]);
    if (!recurrence) throw new NotFoundException("반복 규칙을 찾을 수 없습니다");
    await this.assertStudioOwner(recurrence.studioId, userId);

    await this.db.delete(studioRecurrences).where(eq(studioRecurrences.id, recurrenceId));
    return { success: true };
  }

  /** 반복 활성/비활성 토글 */
  async toggleRecurrence(recurrenceId: string, userId: string) {
    const recurrence = await this.db.select().from(studioRecurrences).where(eq(studioRecurrences.id, recurrenceId)).then((r) => r[0]);
    if (!recurrence) throw new NotFoundException("반복 규칙을 찾을 수 없습니다");
    await this.assertStudioOwner(recurrence.studioId, userId);

    const [updated] = await this.db
      .update(studioRecurrences)
      .set({ isActive: !recurrence.isActive })
      .where(eq(studioRecurrences.id, recurrenceId))
      .returning();
    return updated!;
  }

  /** 반복 규칙 수동 실행 — 콘텐츠 복제 */
  async executeRecurrence(recurrenceId: string, userId: string) {
    const recurrence = await this.db.select().from(studioRecurrences).where(eq(studioRecurrences.id, recurrenceId)).then((r) => r[0]);
    if (!recurrence) throw new NotFoundException("반복 규칙을 찾을 수 없습니다");
    await this.assertStudioOwner(recurrence.studioId, userId);

    // 템플릿 콘텐츠 복제 또는 빈 draft 생성
    let title = recurrence.title;
    let content: string | undefined;
    let summary: string | undefined;

    if (recurrence.templateContentId) {
      const template = await this.db
        .select()
        .from(studioContents)
        .where(eq(studioContents.id, recurrence.templateContentId))
        .then((r) => r[0]);
      if (template) {
        title = template.title;
        content = template.content ?? undefined;
        summary = template.summary ?? undefined;
      }
    }

    const [newContent] = await this.db
      .insert(studioContents)
      .values({
        studioId: recurrence.studioId,
        title,
        content,
        summary,
        label: recurrence.label,
        scheduledAt: recurrence.nextRunAt,
        authorId: userId,
        status: "draft",
      })
      .returning();

    // nextRunAt 갱신
    const nextRun = this.calculateNextRun(recurrence.rule, recurrence.nextRunAt ?? new Date());
    await this.db
      .update(studioRecurrences)
      .set({ lastRunAt: new Date(), nextRunAt: nextRun })
      .where(eq(studioRecurrences.id, recurrenceId));

    return newContent!;
  }

  /** 반복 규칙으로부터 다음 실행일 계산 */
  private calculateNextRun(rule: string, fromDate: Date): Date {
    const [type, value = ""] = rule.split(":");
    const next = new Date(fromDate);

    switch (type) {
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "biweekly":
        next.setDate(next.getDate() + 14);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        const dayNum = parseInt(value, 10);
        if (dayNum) next.setDate(dayNum);
        break;
      default:
        next.setDate(next.getDate() + 7);
    }

    return next;
  }

  // ========================================
  // SEO History
  // ========================================

  async getSeoHistory(contentId: string) {
    return this.db
      .select()
      .from(studioContentSeo)
      .where(eq(studioContentSeo.contentId, contentId))
      .orderBy(desc(studioContentSeo.createdAt));
  }

  async addSeoSnapshot(
    contentId: string,
    input: {
      seoTitle?: string;
      seoDescription?: string;
      seoKeywords?: string[];
      ogImageUrl?: string;
      pageViews?: number;
      uniqueVisitors?: number;
      avgTimeOnPage?: number;
      bounceRate?: number;
    },
    userId: string
  ) {
    const content = await this.db.select().from(studioContents).where(eq(studioContents.id, contentId)).then((r) => r[0]);
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");
    await this.assertStudioOwner(content.studioId, userId);

    const [seo] = await this.db
      .insert(studioContentSeo)
      .values({ contentId, ...input })
      .returning();
    return seo!;
  }

  // ========================================
  // Analysis
  // ========================================

  /** 분석 결과 스냅샷 저장 */
  async saveAnalysisSnapshot(data: {
    contentId: string;
    seoScore: number;
    aeoScore: number;
    geoScore: number;
    totalScore: number;
    seoDetails: Record<string, unknown>;
    aeoDetails: Record<string, unknown>;
    geoDetails: Record<string, unknown>;
    analysisVersion?: string;
  }, userId: string) {
    // Verify content belongs to user
    const content = await this.db.query.studioContents.findFirst({
      where: and(
        eq(studioContents.id, data.contentId),
        eq(studioContents.authorId, userId),
      ),
    });
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");

    const [result] = await this.db.insert(studioContentAnalysis).values({
      contentId: data.contentId,
      seoScore: data.seoScore,
      aeoScore: data.aeoScore,
      geoScore: data.geoScore,
      totalScore: data.totalScore,
      seoDetails: data.seoDetails,
      aeoDetails: data.aeoDetails,
      geoDetails: data.geoDetails,
      analysisVersion: data.analysisVersion ?? "1.0",
    }).returning();

    return result;
  }

  /** 분석 이력 조회 */
  async getAnalysisHistory(contentId: string, userId: string) {
    // Verify content belongs to user
    const content = await this.db.query.studioContents.findFirst({
      where: and(
        eq(studioContents.id, contentId),
        eq(studioContents.authorId, userId),
      ),
    });
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");

    return this.db
      .select()
      .from(studioContentAnalysis)
      .where(eq(studioContentAnalysis.contentId, contentId))
      .orderBy(desc(studioContentAnalysis.snapshotAt))
      .limit(20);
  }

  // ========================================
  // Admin
  // ========================================

  /** 전체 스튜디오 목록 (Admin용, soft delete 포함) */
  async adminFindAll() {
    return this.db
      .select({
        id: studioStudios.id,
        title: studioStudios.title,
        visibility: studioStudios.visibility,
        isDeleted: studioStudios.isDeleted,
        createdAt: studioStudios.createdAt,
        ownerName: profiles.name,
        contentCount: count(studioContents.id),
      })
      .from(studioStudios)
      .leftJoin(profiles, eq(studioStudios.ownerId, profiles.id))
      .leftJoin(studioContents, eq(studioStudios.id, studioContents.studioId))
      .groupBy(studioStudios.id, profiles.name)
      .orderBy(desc(studioStudios.createdAt));
  }

  // ========================================
  // Helpers
  // ========================================

  private async assertStudioOwner(studioId: string, userId: string) {
    const studio = await this.db
      .select({ ownerId: studioStudios.ownerId })
      .from(studioStudios)
      .where(and(eq(studioStudios.id, studioId), eq(studioStudios.isDeleted, false)))
      .then((r) => r[0]);

    if (!studio) throw new NotFoundException("스튜디오를 찾을 수 없습니다");
    if (studio.ownerId !== userId) throw new ForbiddenException("소유자만 수정할 수 있습니다");
  }
}
