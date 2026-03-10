import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { DRIZZLE } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { eq, and, lte, desc, sql } from "drizzle-orm";
import {
  studioStudios,
  studioTopics,
  studioContents,
  studioAiRecurrences,
} from "@superbuilder/drizzle";
import { LLMService } from "../../../features/ai";
import type { TopicSuggestion } from "../../../features/ai";
import { StudioBrandVoiceService } from "./studio-brand-voice.service";

@Injectable()
export class StudioAiSuggestService {
  private readonly logger = new Logger(StudioAiSuggestService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llm: LLMService,
    private readonly brandVoice: StudioBrandVoiceService,
  ) {}

  // ========================================
  // Core AI Methods
  // ========================================

  /** 주제 기반 AI 콘텐츠 추천 */
  async suggest(
    input: { topicId: string; studioId: string; prompt?: string },
    userId: string,
  ): Promise<TopicSuggestion[]> {
    await this.assertStudioOwner(input.studioId, userId);

    const topic = await this.db
      .select()
      .from(studioTopics)
      .where(
        and(
          eq(studioTopics.id, input.topicId),
          eq(studioTopics.studioId, input.studioId),
        ),
      )
      .then((r) => r[0]);

    if (!topic) throw new NotFoundException("주제를 찾을 수 없습니다");

    const studio = await this.db
      .select()
      .from(studioStudios)
      .where(eq(studioStudios.id, input.studioId))
      .then((r) => r[0]);

    if (!studio) throw new NotFoundException("스튜디오를 찾을 수 없습니다");

    // 기존 콘텐츠 조회
    const existingContents = await this.db
      .select()
      .from(studioContents)
      .where(
        and(
          eq(studioContents.studioId, input.studioId),
          eq(studioContents.topicId, input.topicId),
          eq(studioContents.isDeleted, false),
        ),
      )
      .orderBy(desc(studioContents.createdAt));

    const items = existingContents.map((c) => ({
      title: c.title,
      itemType: c.status,
      contentPreview: c.summary ?? c.title,
    }));

    const contextTitle = input.prompt
      ? `${topic.label} — ${input.prompt}`
      : topic.label;

    const brandContext = await this.brandVoice.buildBrandContext(input.studioId);

    return this.llm.suggestTopics({
      contextTitle,
      contextDescription: studio.description ?? undefined,
      items,
      brandContext: brandContext ?? undefined,
    });
  }

  /** AI 추천 주제로 초안 콘텐츠 생성 */
  async generate(
    input: { studioId: string; topicId: string; suggestion: TopicSuggestion },
    userId: string,
  ) {
    await this.assertStudioOwner(input.studioId, userId);

    const studio = await this.db
      .select()
      .from(studioStudios)
      .where(eq(studioStudios.id, input.studioId))
      .then((r) => r[0]);

    if (!studio) throw new NotFoundException("스튜디오를 찾을 수 없습니다");

    // 기존 콘텐츠 제목 목록 (중복 방지)
    const existingContents = await this.db
      .select({ title: studioContents.title })
      .from(studioContents)
      .where(
        and(
          eq(studioContents.studioId, input.studioId),
          eq(studioContents.isDeleted, false),
        ),
      );

    const existingTitles = existingContents.map((c) => c.title);

    const brandContext = await this.brandVoice.buildBrandContext(input.studioId);

    const draft = await this.llm.generateDraft({
      contextTitle: studio.title,
      topicTitle: input.suggestion.title,
      topicDescription: input.suggestion.description,
      nodeType: input.suggestion.nodeType,
      existingTitles,
      brandContext: brandContext ?? undefined,
    });

    const [content] = await this.db
      .insert(studioContents)
      .values({
        studioId: input.studioId,
        topicId: input.topicId,
        title: draft.title,
        content: JSON.stringify(draft.content),
        summary: draft.summary,
        label: "ai-suggested",
        status: "draft",
        authorId: userId,
      })
      .returning();

    return content!;
  }

  /** AI 추천 + 초안 생성을 한번에 */
  async suggestAndGenerate(
    input: { studioId: string; topicId: string; prompt?: string },
    userId: string,
  ) {
    const suggestions = await this.suggest(input, userId);

    if (!suggestions.length) {
      throw new NotFoundException("추천할 주제를 찾을 수 없습니다");
    }

    const selected = suggestions[0]!;

    const content = await this.generate(
      {
        studioId: input.studioId,
        topicId: input.topicId,
        suggestion: selected,
      },
      userId,
    );

    return { suggestion: selected, content };
  }

  /** 콘텐츠 컨텍스트 기반 AI 채팅 (에디터 에이전트) */
  async chat(
    input: { studioId: string; contentId: string; prompt: string },
    userId: string,
  ): Promise<string> {
    await this.assertStudioOwner(input.studioId, userId);

    const content = await this.db
      .select()
      .from(studioContents)
      .where(
        and(
          eq(studioContents.id, input.contentId),
          eq(studioContents.studioId, input.studioId),
          eq(studioContents.isDeleted, false),
        ),
      )
      .then((r) => r[0]);

    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");

    const brandContext = await this.brandVoice.buildBrandContext(input.studioId);

    const response = await this.llm.chatCompletion([
      {
        role: "system",
        content: `당신은 콘텐츠 편집 어시스턴트입니다. 사용자가 작성 중인 콘텐츠에 대해 도움을 제공합니다.
현재 콘텐츠 정보:
- 제목: ${content.title}
- 상태: ${content.status}
- 본문: ${content.content ?? "(빈 본문)"}

중요 규칙:
- 콘텐츠 수정/개선/톤 변경 요청 시: 수정된 본문 텍스트만 반환하세요. 설명, 머리말, "주요 개선사항" 같은 부가 텍스트를 절대 포함하지 마세요.
- 질문/분석/추천 요청 시: 한국어로 간결하고 실용적인 답변을 제공하세요.${brandContext ?? ""}`,
      },
      {
        role: "user",
        content: input.prompt,
      },
    ]);

    return response;
  }

  /** 콘텐츠 컨텍스트 기반 AI 채팅 — 스트리밍 (에디터 에이전트) */
  async *chatStream(
    input: { studioId: string; contentId: string; prompt: string },
    userId: string,
  ): AsyncGenerator<string> {
    await this.assertStudioOwner(input.studioId, userId);

    const content = await this.db
      .select()
      .from(studioContents)
      .where(
        and(
          eq(studioContents.id, input.contentId),
          eq(studioContents.studioId, input.studioId),
          eq(studioContents.isDeleted, false),
        ),
      )
      .then((r) => r[0]);

    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");

    const brandContext = await this.brandVoice.buildBrandContext(input.studioId);

    yield* this.llm.chatCompletionStream([
      {
        role: "system",
        content: `당신은 콘텐츠 편집 어시스턴트입니다. 사용자가 작성 중인 콘텐츠에 대해 도움을 제공합니다.
현재 콘텐츠 정보:
- 제목: ${content.title}
- 상태: ${content.status}
- 본문: ${content.content ?? "(빈 본문)"}

중요 규칙:
- 콘텐츠 수정/개선/톤 변경 요청 시: 수정된 본문 텍스트만 반환하세요. 설명, 머리말, "주요 개선사항" 같은 부가 텍스트를 절대 포함하지 마세요.
- 질문/분석/추천 요청 시: 한국어로 간결하고 실용적인 답변을 제공하세요.${brandContext ?? ""}`,
      },
      {
        role: "user",
        content: input.prompt,
      },
    ]);
  }

  // ========================================
  // AI Recurrence CRUD
  // ========================================

  /** AI 반복 규칙 목록 조회 */
  async findAiRecurrences(studioId: string, userId: string) {
    await this.assertStudioOwner(studioId, userId);

    return this.db
      .select()
      .from(studioAiRecurrences)
      .where(eq(studioAiRecurrences.studioId, studioId))
      .orderBy(studioAiRecurrences.createdAt);
  }

  /** AI 반복 규칙 생성 */
  async createAiRecurrence(
    input: {
      studioId: string;
      topicId: string;
      prompt?: string;
      rule: "weekly" | "biweekly" | "monthly";
      nextRunAt?: Date;
    },
    userId: string,
  ) {
    await this.assertStudioOwner(input.studioId, userId);

    // topicId 존재 + studioId 소유권 확인
    const topic = await this.db
      .select()
      .from(studioTopics)
      .where(
        and(
          eq(studioTopics.id, input.topicId),
          eq(studioTopics.studioId, input.studioId),
        ),
      )
      .then((r) => r[0]);

    if (!topic) throw new NotFoundException("주제를 찾을 수 없습니다");

    const nextRunAt =
      input.nextRunAt ?? this.calculateNextRun(input.rule, new Date());

    const [recurrence] = await this.db
      .insert(studioAiRecurrences)
      .values({
        studioId: input.studioId,
        topicId: input.topicId,
        prompt: input.prompt,
        rule: input.rule,
        nextRunAt,
        createdBy: userId,
      })
      .returning();

    return recurrence!;
  }

  /** AI 반복 규칙 수정 */
  async updateAiRecurrence(
    recurrenceId: string,
    input: { prompt?: string | null; rule?: "weekly" | "biweekly" | "monthly"; nextRunAt?: Date | null },
    userId: string,
  ) {
    const recurrence = await this.db
      .select()
      .from(studioAiRecurrences)
      .where(eq(studioAiRecurrences.id, recurrenceId))
      .then((r) => r[0]);

    if (!recurrence)
      throw new NotFoundException("AI 반복 규칙을 찾을 수 없습니다");

    await this.assertStudioOwner(recurrence.studioId, userId);

    const [updated] = await this.db
      .update(studioAiRecurrences)
      .set(input)
      .where(eq(studioAiRecurrences.id, recurrenceId))
      .returning();

    return updated!;
  }

  /** AI 반복 규칙 삭제 */
  async deleteAiRecurrence(recurrenceId: string, userId: string) {
    const recurrence = await this.db
      .select()
      .from(studioAiRecurrences)
      .where(eq(studioAiRecurrences.id, recurrenceId))
      .then((r) => r[0]);

    if (!recurrence)
      throw new NotFoundException("AI 반복 규칙을 찾을 수 없습니다");

    await this.assertStudioOwner(recurrence.studioId, userId);

    await this.db
      .delete(studioAiRecurrences)
      .where(eq(studioAiRecurrences.id, recurrenceId));

    return { success: true };
  }

  /** AI 반복 규칙 활성/비활성 토글 */
  async toggleAiRecurrence(recurrenceId: string, userId: string) {
    const recurrence = await this.db
      .select()
      .from(studioAiRecurrences)
      .where(eq(studioAiRecurrences.id, recurrenceId))
      .then((r) => r[0]);

    if (!recurrence)
      throw new NotFoundException("AI 반복 규칙을 찾을 수 없습니다");

    await this.assertStudioOwner(recurrence.studioId, userId);

    const [updated] = await this.db
      .update(studioAiRecurrences)
      .set({ isActive: !recurrence.isActive })
      .where(eq(studioAiRecurrences.id, recurrenceId))
      .returning();

    return updated!;
  }

  // ========================================
  // Cron
  // ========================================

  /** 예정된 AI 반복 규칙 일괄 실행 (Cron에서 호출) */
  async processDueRecurrences() {
    const now = new Date();

    const dueRecurrences = await this.db
      .select()
      .from(studioAiRecurrences)
      .where(
        and(
          eq(studioAiRecurrences.isActive, true),
          lte(studioAiRecurrences.nextRunAt, now),
        ),
      );

    let processedCount = 0;

    for (const recurrence of dueRecurrences) {
      try {
        const nextRunAt = this.calculateNextRun(
          recurrence.rule,
          recurrence.nextRunAt ?? now,
        );

        // Optimistic lock: nextRunAt를 먼저 갱신하여 동시 실행 방지
        const [claimed] = await this.db
          .update(studioAiRecurrences)
          .set({ nextRunAt })
          .where(
            and(
              eq(studioAiRecurrences.id, recurrence.id),
              lte(studioAiRecurrences.nextRunAt, now),
            ),
          )
          .returning();

        if (!claimed) continue; // 다른 인스턴스가 이미 선점

        await this.suggestAndGenerate(
          {
            studioId: recurrence.studioId,
            topicId: recurrence.topicId,
            prompt: recurrence.prompt ?? undefined,
          },
          recurrence.createdBy,
        );

        // 원자적 카운터 증가
        await this.db
          .update(studioAiRecurrences)
          .set({
            lastRunAt: now,
            totalGenerated: sql`${studioAiRecurrences.totalGenerated} + 1`,
          })
          .where(eq(studioAiRecurrences.id, recurrence.id));

        processedCount++;
      } catch (error) {
        this.logger.error(
          `AI 반복 실행 실패 — recurrenceId=${recurrence.id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }

    return { processedCount, total: dueRecurrences.length };
  }

  // ========================================
  // Helpers
  // ========================================

  /** 반복 규칙으로부터 다음 실행일 계산 */
  private calculateNextRun(rule: string, fromDate: Date): Date {
    const next = new Date(fromDate);

    switch (rule) {
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "biweekly":
        next.setDate(next.getDate() + 14);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        this.logger.warn(`알 수 없는 반복 규칙: "${rule}" — 기본 7일 적용`);
        next.setDate(next.getDate() + 7);
    }

    return next;
  }

  /** 스튜디오 소유자 권한 확인 */
  private async assertStudioOwner(studioId: string, userId: string) {
    const studio = await this.db
      .select({ ownerId: studioStudios.ownerId })
      .from(studioStudios)
      .where(
        and(eq(studioStudios.id, studioId), eq(studioStudios.isDeleted, false)),
      )
      .then((r) => r[0]);

    if (!studio) throw new NotFoundException("스튜디오를 찾을 수 없습니다");
    if (studio.ownerId !== userId)
      throw new ForbiddenException("소유자만 수정할 수 있습니다");
  }
}
