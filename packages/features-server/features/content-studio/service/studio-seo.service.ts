/**
 * StudioSeoService - SEO 키워드 추천 + 내부 링크 추천
 *
 * AI 기반 키워드 리서치와 같은 스튜디오 내 콘텐츠 목록을 제공한다.
 */
import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { DRIZZLE } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { eq, and, desc, ne } from "drizzle-orm";
import { studioStudios, studioContents } from "@superbuilder/drizzle";
import { LLMService } from "../../../features/ai";

// ============================================================================
// Types
// ============================================================================

export interface KeywordSuggestion {
  mainKeywords: { keyword: string; reason: string }[];
  longTailKeywords: { keyword: string; reason: string }[];
  questionKeywords: string[];
  relatedQueries: string[];
}

export interface LinkableContent {
  id: string;
  title: string;
  summary: string | null;
  status: string;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class StudioSeoService {
  private readonly logger = new Logger(StudioSeoService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llm: LLMService,
  ) {}

  // ========================================
  // AI 키워드 추천
  // ========================================

  /** AI 기반 SEO 키워드 추천 */
  async suggestKeywords(
    input: {
      studioId: string;
      contentId: string;
      title: string;
      bodyText: string;
      currentKeywords: string[];
    },
    userId: string,
  ): Promise<KeywordSuggestion> {
    await this.assertStudioOwner(input.studioId, userId);

    const bodyPreview = input.bodyText.slice(0, 500);

    const raw = await this.llm.chatCompletion(
      [
        {
          role: "system",
          content: `당신은 SEO 키워드 리서치 전문가입니다.
주어진 콘텐츠의 제목과 본문을 분석하여 검색 엔진 최적화에 효과적인 키워드를 추천합니다.

응답은 반드시 다음 JSON 형식으로:
{
  "mainKeywords": [
    { "keyword": "핵심 키워드", "reason": "추천 이유" }
  ],
  "longTailKeywords": [
    { "keyword": "롱테일 키워드 구문", "reason": "추천 이유" }
  ],
  "questionKeywords": ["질문형 키워드 1", "질문형 키워드 2"],
  "relatedQueries": ["관련 검색어 1", "관련 검색어 2"]
}

규칙:
- mainKeywords: 핵심 키워드 3~5개 (검색 볼륨 높은 단어)
- longTailKeywords: 롱테일 키워드 5~7개 (3~5단어 구문, 구체적 의도)
- questionKeywords: 질문형 키워드 3~5개 ("~하는 방법", "~이란?", "왜 ~인가" 등)
- relatedQueries: 관련 검색어 3~5개
- 한국어 키워드 우선, 영문 키워드는 필요한 경우만
- 현재 설정된 키워드와 중복되지 않는 새로운 키워드 추천`,
        },
        {
          role: "user",
          content: `제목: "${input.title}"

본문 (첫 500자):
${bodyPreview || "(본문이 비어있습니다)"}

현재 키워드: ${input.currentKeywords.length > 0 ? input.currentKeywords.join(", ") : "(없음)"}

위 콘텐츠에 적합한 SEO 키워드를 추천해주세요.`,
        },
      ],
      { jsonMode: true },
    );

    try {
      const parsed = JSON.parse(raw);
      return {
        mainKeywords: parsed.mainKeywords ?? [],
        longTailKeywords: parsed.longTailKeywords ?? [],
        questionKeywords: parsed.questionKeywords ?? [],
        relatedQueries: parsed.relatedQueries ?? [],
      };
    } catch (e) {
      this.logger.error("AI 키워드 추천 파싱 실패", e);
      return {
        mainKeywords: [],
        longTailKeywords: [],
        questionKeywords: [],
        relatedQueries: [],
      };
    }
  }

  // ========================================
  // 내부 링크 추천
  // ========================================

  /** 같은 스튜디오 내 콘텐츠 목록 (내부 링크 추천용) */
  async getStudioContentsForLinking(
    studioId: string,
    excludeContentId: string,
    userId: string,
  ): Promise<LinkableContent[]> {
    await this.assertStudioOwner(studioId, userId);

    const contents = await this.db
      .select({
        id: studioContents.id,
        title: studioContents.title,
        summary: studioContents.summary,
        status: studioContents.status,
      })
      .from(studioContents)
      .where(
        and(
          eq(studioContents.studioId, studioId),
          eq(studioContents.isDeleted, false),
          ne(studioContents.id, excludeContentId),
        ),
      )
      .orderBy(desc(studioContents.updatedAt))
      .limit(20);

    return contents;
  }

  // ========================================
  // Helpers
  // ========================================

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
