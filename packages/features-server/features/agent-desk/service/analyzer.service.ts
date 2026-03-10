import { Injectable, BadRequestException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions, agentDeskFiles, agentDeskMessages } from "@superbuilder/drizzle";
import { LLMService } from "../../../features/ai";
import type { TokenUsage } from "../../../features/ai";
import { createLogger } from "../../../core/logger";
import type { FlowData, FlowScreen } from "./flow-designer.service";
import type { AnalysisResult, ChatMessage, FlowEdge, PipelineStreamEvent } from "../types";

const logger = createLogger("agent-desk");

/**
 * LLM이 잘린 JSON을 반환할 때 repair를 시도합니다.
 * screens 배열이 도중에 잘린 경우 마지막 불완전한 요소를 제거하고 닫습니다.
 */
function repairTruncatedJson(json: string): string {
  // 이미 유효하면 그대로 반환
  try {
    JSON.parse(json);
    return json;
  } catch {
    // 계속 repair 시도
  }

  // 전략: { "screens": [ {완전한 객체}, {완전한 객체}, {불완전...} ] }
  // → 마지막 불완전한 배열 요소를 제거하고 닫기

  // 1단계: string-aware로 bracket 스택을 추적하여 마지막 "완전한" top-level 배열 요소 위치를 찾음
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  // screens 배열 depth에서 마지막으로 완전히 닫힌 } 위치
  let screensArrayDepth = -1;
  let lastCompleteElementEnd = -1;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      // screens 배열의 depth 기록 (root { → screens [ 이므로 depth 2)
      if (ch === "[" && screensArrayDepth === -1 && stack.length === 2) {
        screensArrayDepth = stack.length;
      }
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      // screens 배열 내 요소(depth 3의 {})가 완전히 닫힌 경우
      if (ch === "}" && stack.length === screensArrayDepth) {
        lastCompleteElementEnd = i;
      }
    }
  }

  if (lastCompleteElementEnd === -1) return json;

  // 마지막 완전한 요소까지 잘라내고 배열, 루트 객체를 닫음
  let repaired = json.slice(0, lastCompleteElementEnd + 1);

  // 남은 열린 bracket을 string-aware로 세서 닫기
  const closeStack: string[] = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") closeStack.push("}");
    else if (ch === "[") closeStack.push("]");
    else if (ch === "}" || ch === "]") closeStack.pop();
  }

  // 역순으로 닫기
  while (closeStack.length > 0) {
    repaired += closeStack.pop();
  }

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return json; // repair 실패 시 원본 반환
  }
}

const ANALYSIS_SYSTEM_PROMPT = `당신은 소프트웨어 Feature 분석 전문가입니다.

## 입력
사용자와 에이전트의 대화 이력과 업로드된 파일 내용이 주어집니다.

## 출력
다음 JSON 형식으로 분석 결과를 출력하세요. JSON만 출력하고 다른 텍스트는 포함하지 마세요.

{
  "features": [
    {
      "name": "Feature 이름 (영문 kebab-case, 예: online-booking)",
      "description": "Feature 설명 (한국어)",
      "priority": "high | medium | low",
      "complexity": "simple | moderate | complex",
      "existingFeatures": ["재활용 가능한 기존 Feature명"],
      "gaps": ["추가 구현이 필요한 항목"]
    }
  ],
  "summary": "전체 분석 요약 (한국어)",
  "recommendation": "권장 구현 순서 (한국어)"
}

## 규칙
- 각 Feature는 독립적으로 구현 가능한 단위로 분리합니다.
- 기존 Atlas Feature(auth, blog, payment, booking, community 등)와 겹치는 부분을 식별합니다.
- priority는 비즈니스 중요도, complexity는 기술적 난이도 기준입니다.
- 반드시 유효한 JSON만 출력합니다.`;

const SPEC_SYSTEM_PROMPT = `당신은 Atlas 플랫폼의 Feature 구현 스펙 작성 전문가입니다.

## 입력
Feature 분석 결과(JSON)가 주어집니다.

## 출력
Claude Code가 실행할 수 있는 구현 프롬프트를 Markdown으로 작성하세요.
각 Feature별로 구현 순서와 구체적인 코드 지침(파일 경로, 코드 스니펫)을 포함합니다.

## Atlas 프로젝트 구조 (필수 준수)

### 디렉토리 규칙
| 코드 유형 | 위치 |
|-----------|------|
| DB Schema | \`packages/drizzle/src/schema/features/{name}/index.ts\` |
| Server Feature (Module, Service, Controller, Router, DTO) | \`packages/features/{name}/\` |
| Client Feature (Pages, Components, Hooks, Routes) | \`apps/app/src/features/{name}/\` |
| Admin Feature | \`apps/feature-admin/src/features/{name}/\` |

> **주의**: Server Feature는 \`packages/features/{name}/\`에 위치합니다. \`apps/atlas-server/src/features/\`가 아닙니다.

### Server Feature 파일 구조
\`\`\`
packages/features/{name}/
├── index.ts                    # Public exports
├── {name}.module.ts            # NestJS Module
├── {name}.router.ts            # tRPC Router
├── controller/
│   └── {name}.controller.ts    # REST Controller + Swagger
├── service/
│   └── {name}.service.ts       # Business logic
├── dto/
│   ├── index.ts
│   └── create-{entity}.dto.ts  # Zod DTO
└── types/
    └── index.ts
\`\`\`

### 구현 단계 (각 Feature별)
1. **Schema 정의** — \`packages/drizzle/src/schema/features/{name}/index.ts\`
2. **Types 정의** — \`packages/features/{name}/types/index.ts\`
3. **DTO + Validation** — Zod 기반 DTO
4. **Service 구현** — NestJS \`@Injectable()\` + 로깅
5. **tRPC Router** — \`packages/features/{name}/{name}.router.ts\`
6. **REST Controller + Swagger** — \`packages/features/{name}/controller/{name}.controller.ts\`
7. **NestJS Module** — \`packages/features/{name}/{name}.module.ts\`
8. **등록** — schema index, app.module, app-router, trpc router

### 등록 위치 (필수)
| 항목 | 파일 |
|------|------|
| Schema re-export | \`packages/drizzle/src/schema/index.ts\` |
| Drizzle tablesFilter | \`packages/drizzle/drizzle.config.ts\` |
| NestJS Module | \`apps/atlas-server/src/app.module.ts\` |
| tRPC 타입 | \`packages/features/app-router.ts\` |
| tRPC 런타임 | \`apps/atlas-server/src/trpc/router.ts\` |

## 코드 패턴 (올바른 예시)

### Schema 정의
\`\`\`typescript
// packages/drizzle/src/schema/features/{name}/index.ts
import { pgTable, pgEnum, text, timestamp, uuid, boolean, varchar } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";

// 테이블명 규칙: {feature}_{entity} (예: faq_categories, faq_items)
export const faqCategories = pgTable("faq_categories", {
  ...baseColumns(),
  name: varchar("name", { length: 100 }).notNull(),
  // FK: profiles 테이블 참조
  createdById: uuid("created_by_id").references(() => profiles.id, { onDelete: "cascade" }),
});

export type FaqCategory = typeof faqCategories.$inferSelect;
export type NewFaqCategory = typeof faqCategories.$inferInsert;
\`\`\`

### Service
\`\`\`typescript
// packages/features/{name}/service/{name}.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { eq, desc, and, count } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { faqCategories } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("{name}");

@Injectable()
export class FaqService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}
  // ...
}
\`\`\`

### DTO (Zod)
\`\`\`typescript
// packages/features/{name}/dto/create-{entity}.dto.ts
import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const createFaqSchema = z.object({
  question: z.string().min(1).max(500).describe("질문"),
  answer: z.string().min(1).describe("답변"),
});

export class CreateFaqDto extends createZodDto(createFaqSchema) {}
\`\`\`

### tRPC Router
\`\`\`typescript
// packages/features/{name}/{name}.router.ts
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../../../core/trpc";
import { z } from "zod";

let faqService: FaqService;
export function setFaqService(s: FaqService) { faqService = s; }

export const faqRouter = router({
  list: publicProcedure.query(() => faqService.findAll()),
  create: adminProcedure.input(createFaqSchema).mutation(({ input }) => faqService.create(input)),
});
\`\`\`

### REST Controller + Swagger
\`\`\`typescript
// packages/features/{name}/controller/{name}.controller.ts
import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Query, DefaultValuePipe, ParseIntPipe } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
// Global prefix "api"가 자동 적용 — @Controller에 "api/" 포함하지 않음
@ApiTags("FAQ")
@Controller("faq")
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Get()
  @ApiOperation({ summary: "FAQ 목록 조회" })
  @ApiResponse({ status: 200, description: "FAQ 목록" })
  async findAll() { return this.faqService.findAll(); }
}
\`\`\`

### NestJS Module (Service Injection 패턴)
\`\`\`typescript
// packages/features/{name}/{name}.module.ts
import { Module, type OnModuleInit } from "@nestjs/common";
import { FaqService } from "./service/faq.service";
import { FaqController } from "./controller/faq.controller";
import { setFaqService } from "./{name}.router";

@Module({
  controllers: [FaqController],
  providers: [FaqService],
  exports: [FaqService],
})
export class FaqModule implements OnModuleInit {
  constructor(private readonly faqService: FaqService) {}
  onModuleInit() { setFaqService(this.faqService); }
}
\`\`\`

## 금지 사항
- \`apps/server/\` 또는 \`apps/atlas-server/src/features/\` 경로 사용 금지 → \`packages/features/\` 사용
- \`@anatine/zod-nestjs\` 사용 금지 → \`@/shared/zod-nestjs\` 사용
- \`DrizzleService\` 클래스 주입 금지 → \`@InjectDrizzle()\` 데코레이터 사용
- \`@Controller("api/...")\` 금지 → Global prefix가 자동 적용, \`@Controller("faq")\` 사용
- \`console.log/error\` 금지 → \`createLogger("{feature}")\` 사용
- 기존 Feature 수정 절대 금지`;

const SCREEN_GENERATION_SYSTEM_PROMPT = `당신은 소프트웨어 화면 설계 전문가입니다.

## 입력
Feature 분석 결과(JSON), 대화 이력, 업로드된 파일 내용이 주어집니다.

## 출력
다음 JSON 형식으로 화면 목록을 출력하세요. JSON만 출력하고 다른 텍스트는 포함하지 마세요.

{
  "screens": [
    {
      "name": "화면 이름 (한국어)",
      "description": "화면 목적과 기능 설명 (한국어)",
      "wireframeType": "form | list | detail | dashboard | settings | landing | empty",
      "metadata": {
        "keyElements": ["UI 요소1", "UI 요소2"],
        "purpose": "이 화면의 핵심 목적",
        "notes": "추가 참고사항"
      },
      "detail": {
        "screenGoal": "이 화면이 달성해야 하는 핵심 목표 (한국어, 2~3문장)",
        "primaryUser": "주요 사용자 역할 (예: 일반 회원, 관리자, 비회원)",
        "routePath": "예상 라우트 경로 (예: /booking/new)",
        "keyElements": ["헤더", "검색바", "필터", "카드 리스트", "페이지네이션"],
        "inputs": ["이메일 입력", "비밀번호 입력", "날짜 선택"],
        "actions": ["로그인 버튼", "회원가입 링크", "비밀번호 찾기"],
        "states": ["로딩 중", "빈 상태", "에러 상태", "데이터 표시"],
        "entryConditions": ["로그인 필요", "특정 권한 필요"],
        "exitConditions": ["폼 제출 완료", "취소 버튼 클릭"],
        "notes": "추가 설계 참고사항"
      }
    }
  ]
}

## detail 필드 설명
- **screenGoal**: 화면의 목표. description보다 더 구체적이고 사용자 가치 중심으로 작성.
- **primaryUser**: 이 화면을 주로 사용하는 사용자 유형.
- **routePath**: 프론트엔드 라우팅 경로. kebab-case, 파라미터는 :id 형식.
- **keyElements**: 화면에 포함되어야 할 핵심 UI 요소 목록.
- **inputs**: 사용자 입력 필드 목록 (텍스트 입력, 선택, 체크박스 등).
- **actions**: 사용자가 수행할 수 있는 액션/버튼 목록.
- **states**: 화면이 가질 수 있는 상태 목록 (로딩, 빈 상태, 에러 등).
- **entryConditions**: 화면 진입 조건 (인증, 권한, 이전 단계 완료 등).
- **exitConditions**: 화면 이탈/완료 조건.
- **notes**: 기타 설계 참고사항.

## 규칙
- 각 화면은 사용자가 볼 수 있는 독립적인 페이지 단위입니다.
- 화면 순서는 일반적인 사용자 플로우에 맞게 배치합니다.
- wireframeType은 화면의 주요 구조를 나타냅니다.
- 분석 결과의 features와 gaps를 모두 반영하여 필요한 화면을 빠짐없이 추출합니다.
- detail의 각 필드를 최대한 상세하게 채워주세요. 빈 배열보다는 합리적으로 추론하여 채우세요.
- 반드시 유효한 JSON만 출력합니다.`;

@Injectable()
export class AnalyzerService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly llmService: LLMService,
  ) {}

  async analyze(sessionId: string, model?: string): Promise<AnalysisResult> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });

    if (!session) {
      throw new BadRequestException(`Session not found: ${sessionId}`);
    }

    const [messages, files] = await Promise.all([
      this.db.query.agentDeskMessages.findMany({
        where: eq(agentDeskMessages.sessionId, sessionId),
      }),
      this.db.query.agentDeskFiles.findMany({
        where: eq(agentDeskFiles.sessionId, sessionId),
      }),
    ]);

    const historyText = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");

    const parsedFiles = files.filter((f) => f.parsedContent !== null);
    const fileContextText = parsedFiles
      .map((f) => `### 파일: ${f.originalName}\n${f.parsedContent}`)
      .join("\n\n");

    const chatMessages: ChatMessage[] = [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
    ];

    if (fileContextText) {
      chatMessages.push({
        role: "system",
        content: `업로드된 파일 내용:\n${fileContextText}`,
      });
    }

    chatMessages.push({
      role: "user",
      content: `대화 이력:\n${historyText}`,
    });

    logger.info("Starting LLM analysis", {
      "agent_desk.session_id": sessionId,
      "agent_desk.model": model ?? "default",
      "agent_desk.message_count": messages.length,
      "agent_desk.file_count": parsedFiles.length,
    });

    let response: string;
    let usage: TokenUsage | undefined;
    try {
      const timeout = 180_000; // 3분 타임아웃
      const result = await Promise.race([
        this.llmService.chatCompletionWithUsage(chatMessages, model ? { model, jsonMode: true } : { jsonMode: true }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`LLM 분석 타임아웃 (${timeout / 1000}초)`)), timeout),
        ),
      ]);
      response = result.content;
      usage = result.usage;
    } catch (error) {
      logger.error("LLM analysis failed", {
        "agent_desk.session_id": sessionId,
        "error.type": error instanceof Error ? error.constructor.name : "Unknown",
        "error.message": error instanceof Error ? error.message : String(error),
      });
      throw new BadRequestException(
        error instanceof Error ? error.message : "LLM 분석 중 오류가 발생했습니다",
      );
    }

    logger.info("LLM analysis completed", {
      "agent_desk.session_id": sessionId,
      "agent_desk.response_length": response.length,
      "agent_desk.prompt_tokens": usage?.promptTokens ?? 0,
      "agent_desk.completion_tokens": usage?.completionTokens ?? 0,
      "agent_desk.total_tokens": usage?.totalTokens ?? 0,
    });

    // JSON 추출: 여러 패턴 시도
    let jsonText: string | null = null;

    // 1. ```json ... ``` 코드블록 내부
    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1]!.trim();
    }

    // 2. 최외곽 { ... } 매칭
    if (!jsonText) {
      const braceMatch = response.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonText = braceMatch[0];
      }
    }

    if (!jsonText) {
      logger.error("Failed to extract JSON from LLM response", {
        "agent_desk.session_id": sessionId,
        "error.message": "No JSON found in response",
        "agent_desk.response_preview": response.slice(0, 500),
      });
      throw new BadRequestException("LLM response did not contain valid JSON");
    }

    let analysisResult: AnalysisResult;
    try {
      analysisResult = JSON.parse(jsonText) as AnalysisResult;
    } catch (error) {
      logger.error("Failed to parse analysis JSON", {
        "agent_desk.session_id": sessionId,
        "error.message": error instanceof Error ? error.message : String(error),
        "agent_desk.json_preview": jsonText.slice(0, 500),
      });
      throw new BadRequestException("Failed to parse LLM analysis response as JSON");
    }

    await this.db
      .update(agentDeskSessions)
      .set({ analysisResult, status: "analyzed" })
      .where(eq(agentDeskSessions.id, sessionId));

    logger.info("Session analyzed", {
      "agent_desk.session_id": sessionId,
      "agent_desk.feature_count": analysisResult.features.length,
    });

    return { ...analysisResult, usage };
  }

  async generateSpec(sessionId: string, model?: string): Promise<{ spec: string; usage?: TokenUsage }> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });

    if (!session) {
      throw new BadRequestException(`Session not found: ${sessionId}`);
    }

    if (!session.analysisResult) {
      throw new BadRequestException(
        `Session has no analysis result. Run analyze() first: ${sessionId}`,
      );
    }

    const chatMessages: ChatMessage[] = [
      { role: "system", content: SPEC_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(session.analysisResult),
      },
    ];

    logger.info("Starting spec generation", {
      "agent_desk.session_id": sessionId,
      "agent_desk.model": model ?? "default",
    });

    let spec: string;
    let usage: TokenUsage | undefined;
    try {
      const timeout = 180_000;
      const result = await Promise.race([
        this.llmService.chatCompletionWithUsage(chatMessages, model ? { model } : undefined),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`스펙 생성 타임아웃 (${timeout / 1000}초)`)), timeout),
        ),
      ]);
      spec = result.content;
      usage = result.usage;
    } catch (error) {
      logger.error("Spec generation failed", {
        "agent_desk.session_id": sessionId,
        "error.type": error instanceof Error ? error.constructor.name : "Unknown",
        "error.message": error instanceof Error ? error.message : String(error),
      });
      throw new BadRequestException(
        error instanceof Error ? error.message : "스펙 생성 중 오류가 발생했습니다",
      );
    }

    await this.db
      .update(agentDeskSessions)
      .set({ spec, status: "spec_generated" })
      .where(eq(agentDeskSessions.id, sessionId));

    logger.info("Spec generated", {
      "agent_desk.session_id": sessionId,
      "agent_desk.spec_length": spec.length,
      "agent_desk.prompt_tokens": usage?.promptTokens ?? 0,
      "agent_desk.completion_tokens": usage?.completionTokens ?? 0,
    });

    return { spec, usage };
  }

  async generateScreensFromAnalysis(
    sessionId: string,
    model?: string,
  ): Promise<FlowData & { usage?: TokenUsage }> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });

    if (!session) {
      throw new BadRequestException(`Session not found: ${sessionId}`);
    }

    if (!session.analysisResult) {
      throw new BadRequestException(
        `Session has no analysis result. Run analyze() first: ${sessionId}`,
      );
    }

    const [messages, files] = await Promise.all([
      this.db.query.agentDeskMessages.findMany({
        where: eq(agentDeskMessages.sessionId, sessionId),
      }),
      this.db.query.agentDeskFiles.findMany({
        where: eq(agentDeskFiles.sessionId, sessionId),
      }),
    ]);

    const historyText = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");

    const parsedFiles = files.filter((f) => f.parsedContent !== null);
    const fileContextText = parsedFiles
      .map((f) => `### 파일: ${f.originalName}\n${f.parsedContent}`)
      .join("\n\n");

    const chatMessages: ChatMessage[] = [
      { role: "system", content: SCREEN_GENERATION_SYSTEM_PROMPT },
    ];

    if (fileContextText) {
      chatMessages.push({
        role: "system",
        content: `업로드된 파일 내용:\n${fileContextText}`,
      });
    }

    chatMessages.push({
      role: "user",
      content: `## 분석 결과\n${JSON.stringify(session.analysisResult)}\n\n## 대화 이력\n${historyText}`,
    });

    logger.info("Starting screen generation from analysis", {
      "agent_desk.session_id": sessionId,
      "agent_desk.model": model ?? "default",
      "agent_desk.feature_count": (session.analysisResult as AnalysisResult)?.features?.length ?? 0,
    });

    let response: string;
    let usage: TokenUsage | undefined;
    try {
      const timeout = 180_000;
      const result = await Promise.race([
        this.llmService.chatCompletionWithUsage(
          chatMessages,
          { ...(model ? { model } : {}), jsonMode: true, maxTokens: 32768 },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`화면 생성 LLM 타임아웃 (${timeout / 1000}초)`),
              ),
            timeout,
          ),
        ),
      ]);
      response = result.content;
      usage = result.usage;
    } catch (error) {
      logger.error("Screen generation LLM call failed", {
        "agent_desk.session_id": sessionId,
        "error.type": error instanceof Error ? error.constructor.name : "Unknown",
        "error.message": error instanceof Error ? error.message : String(error),
      });
      throw new BadRequestException(
        `화면 생성 LLM 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    logger.info("Screen generation LLM completed", {
      "agent_desk.session_id": sessionId,
      "agent_desk.response_length": response.length,
      "agent_desk.prompt_tokens": usage?.promptTokens ?? 0,
      "agent_desk.completion_tokens": usage?.completionTokens ?? 0,
    });

    let parsed: { screens: Array<{ name: string; description: string; wireframeType: string; metadata: Record<string, unknown>; detail?: Record<string, unknown> }> } | null =
      null;

    // 1) 마크다운 코드 블록에서 JSON 추출 시도
    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1]!.trim());
      } catch {
        // 코드 블록 파싱 실패 시 다음 단계로
      }
    }

    // 2) 일반 JSON 객체 추출 시도
    if (!parsed) {
      const braceMatch = response.match(/\{[\s\S]*\}/);
      if (!braceMatch) {
        logger.error("Failed to extract JSON from screen generation response", {
          "agent_desk.session_id": sessionId,
          "error.message": "No JSON found in response",
          "agent_desk.response_preview": response.slice(0, 500),
        });
        throw new BadRequestException("LLM response did not contain valid JSON");
      }
      try {
        parsed = JSON.parse(braceMatch[0]);
      } catch {
        // 잘린 JSON repair 시도
        const repaired = repairTruncatedJson(braceMatch[0]);
        try {
          parsed = JSON.parse(repaired);
          logger.warn("Repaired truncated screen generation JSON", {
            "agent_desk.session_id": sessionId,
            "agent_desk.original_length": braceMatch[0].length,
            "agent_desk.repaired_length": repaired.length,
          });
        } catch (error) {
          logger.error("Failed to parse screen generation JSON", {
            "agent_desk.session_id": sessionId,
            "error.message": error instanceof Error ? error.message : String(error),
            "agent_desk.json_preview": braceMatch[0].slice(0, 500),
          });
          throw new BadRequestException("Failed to parse screen generation response as JSON");
        }
      }
    }

    const { randomUUID } = await import("crypto");

    const screens: FlowScreen[] = (parsed!.screens ?? []).map((s, i) => ({
      id: randomUUID(),
      name: s.name,
      order: i,
      description: s.description ?? "",
      wireframeType: s.wireframeType ?? "",
      wireframeMermaid: "",
      nextScreenIds: [],
      metadata: s.metadata ?? {},
      detail: s.detail ? {
        screenGoal: typeof s.detail.screenGoal === "string" ? s.detail.screenGoal : undefined,
        primaryUser: typeof s.detail.primaryUser === "string" ? s.detail.primaryUser : undefined,
        routePath: typeof s.detail.routePath === "string" ? s.detail.routePath : undefined,
        keyElements: Array.isArray(s.detail.keyElements) ? s.detail.keyElements as string[] : undefined,
        inputs: Array.isArray(s.detail.inputs) ? s.detail.inputs as string[] : undefined,
        actions: Array.isArray(s.detail.actions) ? s.detail.actions as string[] : undefined,
        states: Array.isArray(s.detail.states) ? s.detail.states as string[] : undefined,
        entryConditions: Array.isArray(s.detail.entryConditions) ? s.detail.entryConditions as string[] : undefined,
        exitConditions: Array.isArray(s.detail.exitConditions) ? s.detail.exitConditions as string[] : undefined,
        notes: typeof s.detail.notes === "string" ? s.detail.notes : undefined,
      } : undefined,
    }));

    // 순차적으로 nextScreenIds 연결 + edges 생성
    const flowEdges: FlowEdge[] = [];
    for (let i = 0; i < screens.length - 1; i++) {
      const source = screens[i]!;
      const target = screens[i + 1]!;
      source.nextScreenIds = [target.id];
      flowEdges.push({
        id: randomUUID(),
        fromScreenId: source.id,
        toScreenId: target.id,
        conditionLabel: "",
        transitionType: "navigate",
        sourceRequirementIds: [],
      });
    }

    const flowData: FlowData = {
      screens,
      edges: flowEdges,
      currentScreenIndex: 0,
    };

    await this.db
      .update(agentDeskSessions)
      .set({ flowData, status: "designing" })
      .where(eq(agentDeskSessions.id, sessionId));

    logger.info("Screens generated from analysis", {
      "agent_desk.session_id": sessionId,
      "agent_desk.screen_count": screens.length,
    });

    return { ...flowData, usage };
  }

  // ============================================================================
  // Streaming Variants
  // ============================================================================

  async analyzeStream(
    sessionId: string,
    model: string | undefined,
    onEvent: (event: PipelineStreamEvent) => void,
  ): Promise<void> {
    // 1. 세션 데이터 로딩
    onEvent({ type: "progress", stage: "loading_data", message: "세션 데이터 로딩 중" });

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });

    if (!session) {
      throw new BadRequestException(`Session not found: ${sessionId}`);
    }

    const [messages, files] = await Promise.all([
      this.db.query.agentDeskMessages.findMany({
        where: eq(agentDeskMessages.sessionId, sessionId),
      }),
      this.db.query.agentDeskFiles.findMany({
        where: eq(agentDeskFiles.sessionId, sessionId),
      }),
    ]);

    // 2. 프롬프트 구성
    onEvent({ type: "progress", stage: "building_prompt", message: "프롬프트 구성 중" });

    const historyText = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");

    const parsedFiles = files.filter((f) => f.parsedContent !== null);
    const fileContextText = parsedFiles
      .map((f) => `### 파일: ${f.originalName}\n${f.parsedContent}`)
      .join("\n\n");

    const chatMessages: ChatMessage[] = [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
    ];

    if (fileContextText) {
      chatMessages.push({
        role: "system",
        content: `업로드된 파일 내용:\n${fileContextText}`,
      });
    }

    chatMessages.push({
      role: "user",
      content: `대화 이력:\n${historyText}`,
    });

    logger.info("Starting LLM analysis (stream)", {
      "agent_desk.session_id": sessionId,
      "agent_desk.model": model ?? "default",
      "agent_desk.message_count": messages.length,
      "agent_desk.file_count": parsedFiles.length,
    });

    // 3. LLM 스트리밍
    onEvent({ type: "progress", stage: "llm_streaming", message: "AI 분석 중" });

    let fullText = "";
    for await (const chunk of this.llmService.chatCompletionStream(chatMessages, { model })) {
      fullText += chunk;
      onEvent({ type: "text-delta", content: chunk });
    }

    logger.info("LLM analysis stream completed", {
      "agent_desk.session_id": sessionId,
      "agent_desk.response_length": fullText.length,
    });

    // 4. JSON 파싱
    onEvent({ type: "progress", stage: "parsing", message: "결과 파싱 중" });

    let jsonText: string | null = null;

    const codeBlockMatch = fullText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1]!.trim();
    }

    if (!jsonText) {
      const braceMatch = fullText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonText = braceMatch[0];
      }
    }

    if (!jsonText) {
      logger.error("Failed to extract JSON from LLM stream response", {
        "agent_desk.session_id": sessionId,
        "error.message": "No JSON found in response",
        "agent_desk.response_preview": fullText.slice(0, 500),
      });
      throw new BadRequestException("LLM response did not contain valid JSON");
    }

    let analysisResult: AnalysisResult;
    try {
      analysisResult = JSON.parse(jsonText) as AnalysisResult;
    } catch (error) {
      logger.error("Failed to parse analysis JSON (stream)", {
        "agent_desk.session_id": sessionId,
        "error.message": error instanceof Error ? error.message : String(error),
        "agent_desk.json_preview": jsonText.slice(0, 500),
      });
      throw new BadRequestException("Failed to parse LLM analysis response as JSON");
    }

    // 5. DB 저장
    onEvent({ type: "progress", stage: "saving", message: "결과 저장 중" });

    await this.db
      .update(agentDeskSessions)
      .set({ analysisResult, status: "analyzed" })
      .where(eq(agentDeskSessions.id, sessionId));

    logger.info("Session analyzed (stream)", {
      "agent_desk.session_id": sessionId,
      "agent_desk.feature_count": analysisResult.features.length,
    });

    // 6. 결과 이벤트
    onEvent({ type: "result", data: analysisResult });
    onEvent({ type: "done" });
  }

  async generateSpecStream(
    sessionId: string,
    model: string | undefined,
    onEvent: (event: PipelineStreamEvent) => void,
  ): Promise<void> {
    // 1. 세션 데이터 로딩
    onEvent({ type: "progress", stage: "loading_data", message: "세션 데이터 로딩 중" });

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });

    if (!session) {
      throw new BadRequestException(`Session not found: ${sessionId}`);
    }

    if (!session.analysisResult) {
      throw new BadRequestException(
        `Session has no analysis result. Run analyze() first: ${sessionId}`,
      );
    }

    // 2. 프롬프트 구성
    onEvent({ type: "progress", stage: "building_prompt", message: "프롬프트 구성 중" });

    const chatMessages: ChatMessage[] = [
      { role: "system", content: SPEC_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(session.analysisResult),
      },
    ];

    logger.info("Starting spec generation (stream)", {
      "agent_desk.session_id": sessionId,
      "agent_desk.model": model ?? "default",
    });

    // 3. LLM 스트리밍
    onEvent({ type: "progress", stage: "llm_streaming", message: "AI 스펙 생성 중" });

    let spec = "";
    for await (const chunk of this.llmService.chatCompletionStream(chatMessages, { model })) {
      spec += chunk;
      onEvent({ type: "text-delta", content: chunk });
    }

    // 4. DB 저장
    onEvent({ type: "progress", stage: "saving", message: "결과 저장 중" });

    await this.db
      .update(agentDeskSessions)
      .set({ spec, status: "spec_generated" })
      .where(eq(agentDeskSessions.id, sessionId));

    logger.info("Spec generated (stream)", {
      "agent_desk.session_id": sessionId,
      "agent_desk.spec_length": spec.length,
    });

    // 5. 결과 이벤트
    onEvent({ type: "result", data: { spec } });
    onEvent({ type: "done" });
  }

  async generateScreensFromAnalysisStream(
    sessionId: string,
    model: string | undefined,
    onEvent: (event: PipelineStreamEvent) => void,
  ): Promise<void> {
    // 1. 세션 데이터 로딩
    onEvent({ type: "progress", stage: "loading_data", message: "세션 데이터 로딩 중" });

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });

    if (!session) {
      throw new BadRequestException(`Session not found: ${sessionId}`);
    }

    if (!session.analysisResult) {
      throw new BadRequestException(
        `Session has no analysis result. Run analyze() first: ${sessionId}`,
      );
    }

    const [messages, files] = await Promise.all([
      this.db.query.agentDeskMessages.findMany({
        where: eq(agentDeskMessages.sessionId, sessionId),
      }),
      this.db.query.agentDeskFiles.findMany({
        where: eq(agentDeskFiles.sessionId, sessionId),
      }),
    ]);

    // 2. 프롬프트 구성
    onEvent({ type: "progress", stage: "building_prompt", message: "프롬프트 구성 중" });

    const historyText = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");

    const parsedFiles = files.filter((f) => f.parsedContent !== null);
    const fileContextText = parsedFiles
      .map((f) => `### 파일: ${f.originalName}\n${f.parsedContent}`)
      .join("\n\n");

    const chatMessages: ChatMessage[] = [
      { role: "system", content: SCREEN_GENERATION_SYSTEM_PROMPT },
    ];

    if (fileContextText) {
      chatMessages.push({
        role: "system",
        content: `업로드된 파일 내용:\n${fileContextText}`,
      });
    }

    chatMessages.push({
      role: "user",
      content: `## 분석 결과\n${JSON.stringify(session.analysisResult)}\n\n## 대화 이력\n${historyText}`,
    });

    logger.info("Starting screen generation from analysis (stream)", {
      "agent_desk.session_id": sessionId,
      "agent_desk.model": model ?? "default",
      "agent_desk.feature_count": (session.analysisResult as AnalysisResult)?.features?.length ?? 0,
    });

    // 3. LLM 스트리밍
    onEvent({ type: "progress", stage: "llm_streaming", message: "AI 화면 생성 중" });

    let response = "";
    for await (const chunk of this.llmService.chatCompletionStream(chatMessages, { model, maxTokens: 32768 })) {
      response += chunk;
      onEvent({ type: "text-delta", content: chunk });
    }

    logger.info("Screen generation LLM stream completed", {
      "agent_desk.session_id": sessionId,
      "agent_desk.response_length": response.length,
    });

    // 4. JSON 파싱
    onEvent({ type: "progress", stage: "parsing", message: "결과 파싱 중" });

    let parsed: { screens: Array<{ name: string; description: string; wireframeType: string; metadata: Record<string, unknown>; detail?: Record<string, unknown> }> } | null =
      null;

    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1]!.trim());
      } catch {
        // 코드 블록 파싱 실패 시 다음 단계로
      }
    }

    if (!parsed) {
      const braceMatch = response.match(/\{[\s\S]*\}/);
      if (!braceMatch) {
        logger.error("Failed to extract JSON from screen generation stream response", {
          "agent_desk.session_id": sessionId,
          "error.message": "No JSON found in response",
          "agent_desk.response_preview": response.slice(0, 500),
        });
        throw new BadRequestException("LLM response did not contain valid JSON");
      }
      try {
        parsed = JSON.parse(braceMatch[0]);
      } catch {
        // 잘린 JSON repair 시도
        const repaired = repairTruncatedJson(braceMatch[0]);
        try {
          parsed = JSON.parse(repaired);
          logger.warn("Repaired truncated screen generation JSON (stream)", {
            "agent_desk.session_id": sessionId,
            "agent_desk.original_length": braceMatch[0].length,
            "agent_desk.repaired_length": repaired.length,
          });
        } catch (error) {
          logger.error("Failed to parse screen generation JSON (stream)", {
            "agent_desk.session_id": sessionId,
            "error.message": error instanceof Error ? error.message : String(error),
            "agent_desk.json_preview": braceMatch[0].slice(0, 500),
          });
          throw new BadRequestException("Failed to parse screen generation response as JSON");
        }
      }
    }

    // 5. 화면 데이터 구성
    const { randomUUID } = await import("crypto");

    const screens: FlowScreen[] = (parsed!.screens ?? []).map((s, i) => ({
      id: randomUUID(),
      name: s.name,
      order: i,
      description: s.description ?? "",
      wireframeType: s.wireframeType ?? "",
      wireframeMermaid: "",
      nextScreenIds: [],
      metadata: s.metadata ?? {},
      detail: s.detail ? {
        screenGoal: typeof s.detail.screenGoal === "string" ? s.detail.screenGoal : undefined,
        primaryUser: typeof s.detail.primaryUser === "string" ? s.detail.primaryUser : undefined,
        routePath: typeof s.detail.routePath === "string" ? s.detail.routePath : undefined,
        keyElements: Array.isArray(s.detail.keyElements) ? s.detail.keyElements as string[] : undefined,
        inputs: Array.isArray(s.detail.inputs) ? s.detail.inputs as string[] : undefined,
        actions: Array.isArray(s.detail.actions) ? s.detail.actions as string[] : undefined,
        states: Array.isArray(s.detail.states) ? s.detail.states as string[] : undefined,
        entryConditions: Array.isArray(s.detail.entryConditions) ? s.detail.entryConditions as string[] : undefined,
        exitConditions: Array.isArray(s.detail.exitConditions) ? s.detail.exitConditions as string[] : undefined,
        notes: typeof s.detail.notes === "string" ? s.detail.notes : undefined,
      } : undefined,
    }));

    const flowEdges: FlowEdge[] = [];
    for (let i = 0; i < screens.length - 1; i++) {
      const source = screens[i]!;
      const target = screens[i + 1]!;
      source.nextScreenIds = [target.id];
      flowEdges.push({
        id: randomUUID(),
        fromScreenId: source.id,
        toScreenId: target.id,
        conditionLabel: "",
        transitionType: "navigate",
        sourceRequirementIds: [],
      });
    }

    const flowData: FlowData = {
      screens,
      edges: flowEdges,
      currentScreenIndex: 0,
    };

    // 6. DB 저장
    onEvent({ type: "progress", stage: "saving", message: "결과 저장 중" });

    await this.db
      .update(agentDeskSessions)
      .set({ flowData, status: "designing" })
      .where(eq(agentDeskSessions.id, sessionId));

    logger.info("Screens generated from analysis (stream)", {
      "agent_desk.session_id": sessionId,
      "agent_desk.screen_count": screens.length,
    });

    // 7. 결과 이벤트
    onEvent({ type: "result", data: flowData });
    onEvent({ type: "done" });
  }
}
