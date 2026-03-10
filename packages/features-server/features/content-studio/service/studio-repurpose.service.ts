import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { DRIZZLE } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { eq, and } from "drizzle-orm";
import {
  studioStudios,
  studioContents,
  studioEdges,
} from "@superbuilder/drizzle";
import type { StudioContent, StudioRepurposeFormat } from "@superbuilder/drizzle";
import { LLMService } from "../../../features/ai";
import { StudioBrandVoiceService } from "./studio-brand-voice.service";

@Injectable()
export class StudioRepurposeService {
  private readonly logger = new Logger(StudioRepurposeService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llm: LLMService,
    private readonly brandVoice: StudioBrandVoiceService,
  ) {}

  // ========================================
  // Core Methods
  // ========================================

  /** 단일 포맷 변환 */
  async convert(
    input: {
      contentId: string;
      format: StudioRepurposeFormat;
      customInstruction?: string;
    },
    userId: string,
  ) {
    // 1. 원본 콘텐츠 조회
    const content = await this.db
      .select()
      .from(studioContents)
      .where(
        and(
          eq(studioContents.id, input.contentId),
          eq(studioContents.isDeleted, false),
        ),
      )
      .then((r) => r[0]);

    if (!content) {
      throw new NotFoundException("콘텐츠를 찾을 수 없습니다");
    }

    // 2. 소유자 확인
    await this.assertStudioOwner(content.studioId, userId);

    // 3. 원본 콘텐츠 내용 검증
    if (!content.content) {
      throw new BadRequestException("원본 콘텐츠에 내용이 없습니다");
    }

    // 4. 파생 콘텐츠는 리퍼포징 불가
    if (content.derivedFromId !== null) {
      throw new BadRequestException(
        "파생 콘텐츠는 리퍼포징할 수 없습니다. 원본에서 실행하세요",
      );
    }

    // 5. 콘텐츠 길이 검증
    const extractedText = this.extractTextFromTipTap(content.content);
    const MAX_CONTENT_CHARS = 20_000;
    if (extractedText.length > MAX_CONTENT_CHARS) {
      throw new BadRequestException(
        `콘텐츠가 너무 깁니다 (최대 ${MAX_CONTENT_CHARS.toLocaleString()}자)`,
      );
    }

    // 6. 브랜드 보이스 컨텍스트 빌드
    const brandContext = await this.brandVoice.buildBrandContext(
      content.studioId,
    );

    // 7. 프롬프트 구성
    const messages = this.buildPrompt(
      input.format,
      content.content,
      content.title,
      brandContext,
      input.customInstruction,
    );

    // 8. LLM 호출
    const result = await this.llm.chatCompletion(messages, {
      jsonMode: true,
    });

    // 9. 응답 파싱
    let parsed: unknown;
    try {
      parsed = JSON.parse(result);
    } catch (error) {
      this.logger.error("LLM 응답 JSON 파싱 실패", error);
      throw new BadRequestException(
        "AI 응답을 파싱할 수 없습니다. 다시 시도해주세요",
      );
    }

    // 10. 기존 동일 포맷 파생물 조회
    const existing = await this.db
      .select()
      .from(studioContents)
      .where(
        and(
          eq(studioContents.derivedFromId, input.contentId),
          eq(studioContents.repurposeFormat, input.format),
          eq(studioContents.isDeleted, false),
        ),
      )
      .then((r) => r[0]);

    // 11. 업데이트 또는 신규 생성
    if (existing) {
      const [updated] = await this.db
        .update(studioContents)
        .set({
          content: JSON.stringify(parsed),
          title: `${FORMAT_TITLES[input.format]} — ${content.title}`,
        })
        .where(eq(studioContents.id, existing.id))
        .returning();

      // 엣지가 삭제된 경우 재생성
      const existingEdge = await this.db
        .select()
        .from(studioEdges)
        .where(
          and(
            eq(studioEdges.sourceId, input.contentId),
            eq(studioEdges.targetId, existing.id),
            eq(studioEdges.studioId, content.studioId),
          ),
        )
        .then((r) => r[0]);

      if (!existingEdge) {
        await this.db.insert(studioEdges).values({
          studioId: content.studioId,
          sourceId: input.contentId,
          sourceType: "content",
          targetId: existing.id,
          targetType: "content",
        });
      }

      return updated!;
    }

    // 신규 생성
    const { x, y } = this.calculateDerivedPosition(
      content.positionX,
      content.positionY,
      input.format,
    );

    const [newContent] = await this.db
      .insert(studioContents)
      .values({
        studioId: content.studioId,
        topicId: content.topicId,
        title: `${FORMAT_TITLES[input.format]} — ${content.title}`,
        content: JSON.stringify(parsed),
        derivedFromId: input.contentId,
        repurposeFormat: input.format,
        status: "draft",
        authorId: userId,
        positionX: x,
        positionY: y,
      })
      .returning();

    // 엣지 생성 (원본 → 파생물)
    await this.db.insert(studioEdges).values({
      studioId: content.studioId,
      sourceId: input.contentId,
      sourceType: "content",
      targetId: newContent!.id,
      targetType: "content",
    });

    return newContent!;
  }

  /** 일괄 변환 */
  async convertBatch(
    input: {
      contentId: string;
      formats: StudioRepurposeFormat[];
      customInstruction?: string;
    },
    userId: string,
  ) {
    const results: StudioContent[] = [];

    for (const format of input.formats) {
      const result = await this.convert(
        {
          contentId: input.contentId,
          format,
          customInstruction: input.customInstruction,
        },
        userId,
      );
      results.push(result);
    }

    return results;
  }

  /** 파생 콘텐츠 목록 조회 */
  async listDerived(contentId: string, userId: string) {
    // 원본 콘텐츠 조회
    const content = await this.db
      .select()
      .from(studioContents)
      .where(
        and(
          eq(studioContents.id, contentId),
          eq(studioContents.isDeleted, false),
        ),
      )
      .then((r) => r[0]);

    if (!content) {
      throw new NotFoundException("콘텐츠를 찾을 수 없습니다");
    }

    await this.assertStudioOwner(content.studioId, userId);

    return this.db
      .select()
      .from(studioContents)
      .where(
        and(
          eq(studioContents.derivedFromId, contentId),
          eq(studioContents.isDeleted, false),
        ),
      );
  }

  // ========================================
  // Helpers
  // ========================================

  /** LLM 프롬프트 구성 */
  private buildPrompt(
    format: StudioRepurposeFormat,
    content: string,
    title: string,
    brandContext: string | null,
    customInstruction?: string,
  ) {
    let systemPrompt = REPURPOSE_SYSTEM_PROMPT;

    if (brandContext) {
      systemPrompt += brandContext;
    }

    if (customInstruction) {
      systemPrompt += `\n추가 지시사항: ${customInstruction}`;
    }

    systemPrompt += `\n\n${FORMAT_PROMPTS[format]}`;

    systemPrompt += "\n\n응답은 반드시 JSON 형식으로 제공하세요.";

    // TipTap JSON이면 텍스트 추출
    const extractedContent = this.extractTextFromTipTap(content);

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `원본 콘텐츠:\n제목: ${title}\n내용:\n${extractedContent}`,
      },
    ];

    return messages;
  }

  /** TipTap JSON에서 텍스트 추출 */
  private extractTextFromTipTap(content: string): string {
    try {
      const doc = JSON.parse(content);
      if (doc && doc.type === "doc" && Array.isArray(doc.content)) {
        const texts: string[] = [];
        this.collectText(doc.content, texts);
        return texts.join("\n");
      }
      // doc 구조가 아니면 원본 반환
      return content;
    } catch {
      // JSON 파싱 실패 시 원본 string 그대로 반환
      return content;
    }
  }

  /** TipTap 노드 트리를 재귀적으로 순회하며 텍스트 수집 */
  private collectText(
    nodes: Array<{ type?: string; text?: string; content?: unknown[] }>,
    texts: string[],
  ) {
    for (const node of nodes) {
      if (node.type === "text" && node.text) {
        texts.push(node.text);
      }
      if (Array.isArray(node.content)) {
        this.collectText(
          node.content as Array<{
            type?: string;
            text?: string;
            content?: unknown[];
          }>,
          texts,
        );
      }
    }
  }

  /** 파생 콘텐츠 위치 계산 */
  private calculateDerivedPosition(
    originX: number,
    originY: number,
    format: StudioRepurposeFormat,
  ) {
    const formatOrder: Record<StudioRepurposeFormat, number> = {
      card_news: 0,
      short_form: 1,
      twitter_thread: 2,
      email_summary: 3,
    };
    const idx = formatOrder[format];
    return {
      x: originX + (idx - 1.5) * 280,
      y: originY + 250,
    };
  }

  /** 스튜디오 소유자 권한 확인 */
  private async assertStudioOwner(studioId: string, userId: string) {
    const studio = await this.db
      .select({ ownerId: studioStudios.ownerId })
      .from(studioStudios)
      .where(
        and(
          eq(studioStudios.id, studioId),
          eq(studioStudios.isDeleted, false),
        ),
      )
      .then((r) => r[0]);

    if (!studio) throw new NotFoundException("스튜디오를 찾을 수 없습니다");
    if (studio.ownerId !== userId)
      throw new ForbiddenException("소유자만 수정할 수 있습니다");
  }
}

// ========================================
// Constants
// ========================================

const REPURPOSE_SYSTEM_PROMPT = `당신은 콘텐츠 리퍼포징 전문가입니다.
원본 콘텐츠를 지정된 포맷으로 변환합니다.
원본의 핵심 메시지와 정보를 보존하면서, 대상 포맷에 최적화된 형태로 재구성합니다.`;

const FORMAT_PROMPTS: Record<StudioRepurposeFormat, string> = {
  card_news: `원본 글의 핵심 포인트를 5~8장의 카드 뉴스 슬라이드로 변환하세요.
각 슬라이드에는 headline(20자 이내), body(80자 이내), note(발표자 노트)를 포함합니다.

응답 JSON 구조:
{
  "type": "card_news",
  "slides": [{ "slideNumber": 1, "headline": "...", "body": "...", "note": "..." }],
  "totalSlides": 6
}`,

  short_form: `60초 이내 숏폼 영상 스크립트로 변환하세요.
Hook(3초), Body(40초), CTA(5초) 구조를 따릅니다.
관련 해시태그 5개를 추천합니다.

응답 JSON 구조:
{
  "type": "short_form",
  "hook": "처음 3초 — 시선 잡기",
  "body": "메인 내용 (40초)",
  "cta": "행동 유도 (5초)",
  "hashtags": ["#태그1", "#태그2"],
  "estimatedSeconds": 55
}`,

  twitter_thread: `5~10개의 트윗으로 분할하세요.
각 트윗은 280자를 넘지 않습니다.
첫 트윗은 관심을 끌고, 마지막 트윗은 행동을 유도합니다.

응답 JSON 구조:
{
  "type": "twitter_thread",
  "tweets": [{ "index": 1, "text": "...", "charCount": 280 }],
  "totalTweets": 7
}`,

  email_summary: `뉴스레터용 이메일로 변환하세요.
제목(50자 이내), 프리헤더(100자 이내), 본문(3~5문단), CTA 버튼 텍스트를 포함합니다.

응답 JSON 구조:
{
  "type": "email_summary",
  "subject": "이메일 제목",
  "preheader": "미리보기 텍스트",
  "body": "HTML/마크다운 본문",
  "ctaText": "CTA 버튼 텍스트",
  "ctaUrl": ""
}`,
};

const FORMAT_TITLES: Record<StudioRepurposeFormat, string> = {
  card_news: "카드 뉴스",
  short_form: "숏폼 스크립트",
  twitter_thread: "트위터 스레드",
  email_summary: "이메일 요약",
};
