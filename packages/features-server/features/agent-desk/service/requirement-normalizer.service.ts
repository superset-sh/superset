import { Injectable, BadRequestException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskRequirementSources, agentDeskNormalizedRequirements } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import { LLMService } from "../../../features/ai";
import type { NormalizeRequirementsDto } from "../dto/normalize-requirements.dto";
import type { ChatMessage } from "../types";
import { SessionService } from "./session.service";

const logger = createLogger("agent-desk");

const NORMALIZE_SYSTEM_PROMPT = `당신은 요구사항 정규화 전문가입니다.
여러 소스에서 추출된 텍스트를 분석하여 요구사항을 정규화된 형태로 추출합니다.

각 요구사항은 다음 필드를 포함합니다:
- category: "feature" | "role" | "entity" | "validation" | "exception" 중 하나
- summary: 요구사항 요약 (500자 이내)
- detail: 상세 설명 (선택)
- sourceIds: 해당 요구사항의 출처 소스 ID 배열
- confidence: 확신도 (0~100, 정수)
- conflictStatus: "none" | "duplicate" | "conflict" — 다른 요구사항과의 충돌 상태
- dedupeGroupId: 중복/충돌 그룹 ID (UUID 형식, 동일 그룹은 같은 ID)

응답은 반드시 다음 JSON 형식으로:
{
  "requirements": [
    {
      "category": "feature",
      "summary": "...",
      "detail": "...",
      "sourceIds": ["uuid1", "uuid2"],
      "confidence": 85,
      "conflictStatus": "none",
      "dedupeGroupId": null
    }
  ]
}

중복 요구사항은 conflictStatus를 "duplicate"로, 서로 상충하는 요구사항은 "conflict"로 표시하고
동일 dedupeGroupId를 부여합니다.`;

@Injectable()
export class RequirementNormalizerService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly sessionService: SessionService,
    private readonly llmService: LLMService,
  ) {}

  async normalize(input: NormalizeRequirementsDto, userId: string) {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    // parsed 상태의 소스만 조회
    const sources = await this.db.query.agentDeskRequirementSources.findMany({
      where: eq(agentDeskRequirementSources.sessionId, input.sessionId),
    });

    const parsedSources = sources.filter((s) => s.parseStatus === "parsed" && s.parsedContent);

    if (parsedSources.length === 0) {
      logger.info("No parsed sources found for normalization", {
        "agent_desk.session_id": input.sessionId,
      });
      return { requirements: [], sourceCount: 0 };
    }

    // 소스 컨텍스트 조합
    const sourceContext = parsedSources
      .map((s) => `--- [소스: ${s.title}] (ID: ${s.id}, 유형: ${s.sourceType}) ---\n${s.parsedContent}`)
      .join("\n\n");

    const chatMessages: ChatMessage[] = [
      { role: "system", content: NORMALIZE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `다음 소스들에서 요구사항을 추출하고 정규화해주세요:\n\n${sourceContext}`,
      },
    ];

    const response = await this.llmService.chatCompletion(
      chatMessages,
      input.model ? { model: input.model, jsonMode: true } : { jsonMode: true },
    );

    // JSON 파싱 — 전체 응답에서 JSON 추출
    let rawJson = response.trim();
    const codeBlockMatch = rawJson.match(/^```(?:json)?\s*\n?([\s\S]*?)(?:\n?\s*```)?$/);
    if (codeBlockMatch) {
      rawJson = codeBlockMatch[1]!.trim();
    }
    const firstBrace = rawJson.indexOf("{");
    if (firstBrace < 0) {
      logger.error("Failed to extract JSON from normalization response", {
        "agent_desk.session_id": input.sessionId,
        "error.message": "No JSON found in response",
      });
      throw new BadRequestException("LLM 응답에서 유효한 JSON을 추출할 수 없습니다");
    }
    rawJson = rawJson.substring(firstBrace);

    let parsed: { requirements: Array<{
      category: "feature" | "role" | "entity" | "validation" | "exception";
      summary: string;
      detail?: string;
      sourceIds: string[];
      confidence: number;
      conflictStatus: "none" | "duplicate" | "conflict";
      dedupeGroupId?: string | null;
    }> };

    try {
      parsed = JSON.parse(rawJson);
    } catch (parseErr) {
      // 잘린 JSON 복구 시도
      try {
        parsed = this.recoverTruncatedJson(rawJson);
        logger.warn("Recovered truncated JSON for normalization", {
          "agent_desk.session_id": input.sessionId,
        });
      } catch {
        logger.error("Failed to parse normalization JSON", {
          "agent_desk.session_id": input.sessionId,
          "error.message": parseErr instanceof Error ? parseErr.message : "Invalid JSON format",
          "agent_desk.response_preview": response.substring(0, 500),
        });
        throw new BadRequestException("LLM 응답 JSON 파싱에 실패했습니다");
      }
    }

    // 기존 정규화 결과 삭제
    await this.db
      .delete(agentDeskNormalizedRequirements)
      .where(eq(agentDeskNormalizedRequirements.sessionId, input.sessionId));

    // 새로 삽입
    if (parsed.requirements.length > 0) {
      await this.db.insert(agentDeskNormalizedRequirements).values(
        parsed.requirements.map((r) => ({
          sessionId: input.sessionId,
          category: r.category,
          summary: r.summary,
          detail: r.detail ?? null,
          sourceIds: r.sourceIds,
          confidence: r.confidence,
          conflictStatus: r.conflictStatus,
          dedupeGroupId: r.dedupeGroupId ?? null,
        })),
      );
    }

    logger.info("Requirements normalized", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.source_count": parsedSources.length,
      "agent_desk.requirement_count": parsed.requirements.length,
    });

    return {
      requirements: parsed.requirements,
      sourceCount: parsedSources.length,
    };
  }

  async listRequirements(sessionId: string, userId: string) {
    await this.sessionService.verifySessionOwnership(sessionId, userId);

    return this.db.query.agentDeskNormalizedRequirements.findMany({
      where: eq(agentDeskNormalizedRequirements.sessionId, sessionId),
    });
  }

  private recoverTruncatedJson(raw: string): any {
    let truncated = raw;
    for (let i = 0; i < 10; i++) {
      let lastClose = -1;
      for (let j = truncated.length - 1; j >= 0; j--) {
        if (truncated[j] === "}" || truncated[j] === "]") {
          lastClose = j;
          break;
        }
      }
      if (lastClose <= 0) break;
      truncated = truncated.substring(0, lastClose + 1);

      const opens = (truncated.match(/\[/g) || []).length;
      const closes = (truncated.match(/\]/g) || []).length;
      let attempt = truncated + "]".repeat(Math.max(0, opens - closes));
      const openBraces = (attempt.match(/\{/g) || []).length;
      const closeBraces = (attempt.match(/\}/g) || []).length;
      attempt += "}".repeat(Math.max(0, openBraces - closeBraces));

      try {
        return JSON.parse(attempt);
      } catch {
        truncated = truncated.substring(0, lastClose);
        continue;
      }
    }
    throw new Error("Could not recover truncated JSON");
  }
}
