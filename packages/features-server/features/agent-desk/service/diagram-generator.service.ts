import { Injectable, BadRequestException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions, agentDeskFiles } from "@superbuilder/drizzle";
import { LLMService } from "../../../features/ai";
import { createLogger } from "../../../core/logger";
import type {
  DiagramType,
  DiagramResult,
  DiagramGenerationResult,
  ChatMessage,
  AnalysisResult,
} from "../types";

const logger = createLogger("agent-desk");

const DIAGRAM_SYSTEM_PROMPT = `당신은 문서 분석 및 다이어그램 생성 전문가입니다.

## 입력
분석된 문서 내용이 주어집니다.

## 출력
문서 내용을 분석하여 적절한 다이어그램을 Mermaid 코드로 생성합니다.
반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트는 포함하지 마세요.

{
  "diagrams": [
    {
      "type": "flowchart | sequence | er | mindmap | classDiagram | stateDiagram",
      "title": "다이어그램 제목 (한국어)",
      "description": "이 다이어그램이 표현하는 내용 설명 (한국어)",
      "mermaidCode": "graph TD\\n    A[시작] --> B[끝]"
    }
  ],
  "summary": "전체 다이어그램 요약 (한국어)"
}

## 다이어그램 유형 선택 기준
- **flowchart**: 프로세스 흐름, 업무 절차, 의사결정 트리
- **sequence**: API 호출 흐름, 사용자-시스템 상호작용, 시간순 이벤트
- **er**: 데이터 엔티티 관계, DB 스키마 구조
- **mindmap**: 기능 분류, 개념 정리, 아이디어 맵
- **classDiagram**: 객체 구조, 모듈 의존성
- **stateDiagram**: 상태 전이, 워크플로우 상태

## 규칙
- 문서 내용에서 가장 중요한 구조를 파악하여 적절한 다이어그램 유형을 선택합니다.
- 최소 2개, 최대 5개의 다이어그램을 생성합니다.
- Mermaid 코드는 반드시 유효한 문법이어야 합니다.
- 노드 ID에 한국어를 직접 사용하지 말고, 영문 ID 후 대괄호 [] 안에 한국어 레이블을 넣으세요.
- mermaidCode 내 줄바꿈은 실제 \\n으로 표현하세요.
- 반드시 유효한 JSON만 출력합니다.`;

const TARGETED_DIAGRAM_PROMPT = `당신은 문서 분석 및 다이어그램 생성 전문가입니다.

## 입력
분석된 문서 내용과 생성할 다이어그램 유형이 주어집니다.

## 출력
지정된 유형의 다이어그램을 Mermaid 코드로 생성합니다.
반드시 아래 JSON 형식으로만 출력하세요.

{
  "diagram": {
    "type": "지정된 유형",
    "title": "다이어그램 제목 (한국어)",
    "description": "설명 (한국어)",
    "mermaidCode": "유효한 Mermaid 코드"
  }
}

## 규칙
- Mermaid 코드는 반드시 유효한 문법이어야 합니다.
- 노드 ID에 한국어를 직접 사용하지 말고, 영문 ID 후 대괄호 [] 안에 한국어 레이블을 넣으세요.
- mermaidCode 내 줄바꿈은 실제 \\n으로 표현하세요.
- 반드시 유효한 JSON만 출력합니다.`;

@Injectable()
export class DiagramGeneratorService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly llmService: LLMService,
  ) {}

  /**
   * 캐시된 다이어그램 반환 (없으면 null)
   */
  async getCachedDiagrams(sessionId: string): Promise<DiagramGenerationResult | null> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });

    if (!session) {
      throw new BadRequestException(`Session not found: ${sessionId}`);
    }

    if (!session.diagrams) return null;

    const cached = session.diagrams as unknown as {
      diagrams: DiagramResult[];
      summary: string;
    };

    return {
      sessionId,
      diagrams: cached.diagrams,
      summary: cached.summary,
    };
  }

  /**
   * 세션의 분석된 파일과 대화를 기반으로 다이어그램 자동 생성
   */
  async generateDiagrams(
    sessionId: string,
    model?: string,
  ): Promise<DiagramGenerationResult> {
    const documentContext = await this.buildDocumentContext(sessionId);

    return this.callLlmForDiagrams(sessionId, documentContext, model, "Diagrams generated");
  }

  /**
   * 특정 유형의 다이어그램 단건 생성
   */
  async generateSingleDiagram(
    sessionId: string,
    diagramType: DiagramType,
    model?: string,
  ): Promise<DiagramResult> {
    const documentContext = await this.buildDocumentContext(sessionId);

    const chatMessages: ChatMessage[] = [
      { role: "system", content: TARGETED_DIAGRAM_PROMPT },
      {
        role: "user",
        content: `다이어그램 유형: ${diagramType}\n\n문서 내용:\n${documentContext}`,
      },
    ];

    const response = await this.llmService.chatCompletion(
      chatMessages,
      model ? { model, jsonMode: true } : { jsonMode: true },
    );

    const parsed = this.parseJsonResponse<{ diagram: DiagramResult }>(
      response,
      sessionId,
      ["diagram"],
    );

    logger.info("Single diagram generated", {
      "agent_desk.session_id": sessionId,
      "agent_desk.diagram_type": diagramType,
    });

    return parsed.diagram;
  }

  /**
   * 기존 분석 결과(AnalysisResult)를 기반으로 다이어그램 생성
   */
  async generateFromAnalysis(
    sessionId: string,
    model?: string,
  ): Promise<DiagramGenerationResult> {
    const analysisContext = await this.buildAnalysisContext(sessionId);

    return this.callLlmForDiagrams(sessionId, analysisContext, model, "Diagrams generated from analysis");
  }

  /**
   * LLM으로 다이어그램 생성 → JSON 파싱 → 결과 반환 (공통 패턴)
   */
  private async callLlmForDiagrams(
    sessionId: string,
    userContent: string,
    model: string | undefined,
    logMessage: string,
  ): Promise<DiagramGenerationResult> {
    const chatMessages: ChatMessage[] = [
      { role: "system", content: DIAGRAM_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    const response = await this.llmService.chatCompletion(
      chatMessages,
      model ? { model, jsonMode: true } : { jsonMode: true },
    );

    const parsed = this.parseJsonResponse<{
      diagrams: DiagramResult[];
      summary: string;
    }>(response, sessionId, ["diagrams", "summary"]);

    const result: DiagramGenerationResult = {
      sessionId,
      diagrams: parsed.diagrams,
      summary: parsed.summary,
    };

    // 다이어그램 결과를 세션에 캐시
    await this.db
      .update(agentDeskSessions)
      .set({ diagrams: { diagrams: parsed.diagrams, summary: parsed.summary } })
      .where(eq(agentDeskSessions.id, sessionId));

    logger.info(logMessage, {
      "agent_desk.session_id": sessionId,
      "agent_desk.diagram_count": result.diagrams.length,
    });

    return result;
  }

  /**
   * 분석 결과(AnalysisResult)를 기반으로 컨텍스트 구축
   */
  private async buildAnalysisContext(sessionId: string): Promise<string> {
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

    const analysis = session.analysisResult as unknown as AnalysisResult;

    const analysisContext = [
      `## 분석 요약\n${analysis.summary}`,
      `## 권장사항\n${analysis.recommendation}`,
      `## Feature 목록\n${analysis.features
        .map(
          (f) =>
            `- **${f.name}**: ${f.description} (우선순위: ${f.priority}, 복잡도: ${f.complexity})\n  Gaps: ${f.gaps.join(", ")}`,
        )
        .join("\n")}`,
    ].join("\n\n");

    const fileContext = await this.getFileContext(sessionId);
    return fileContext
      ? `${analysisContext}\n\n## 원본 문서\n${fileContext}`
      : analysisContext;
  }

  /**
   * 세션의 파일 + 대화 이력으로 문서 컨텍스트 구축
   */
  private async buildDocumentContext(sessionId: string): Promise<string> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });

    if (!session) {
      throw new BadRequestException(`Session not found: ${sessionId}`);
    }

    const parts: string[] = [];

    // 세션 정보
    if (session.title) {
      parts.push(`## 프로젝트: ${session.title}`);
    }
    if (session.prompt) {
      parts.push(`## 요구사항\n${session.prompt}`);
    }

    // 파일 컨텍스트
    const fileContext = await this.getFileContext(sessionId);
    if (fileContext) {
      parts.push(`## 문서 내용\n${fileContext}`);
    }

    // 분석 결과가 있으면 포함
    if (session.analysisResult) {
      parts.push(
        `## 분석 결과\n${JSON.stringify(session.analysisResult, null, 2)}`,
      );
    }

    if (parts.length === 0) {
      throw new BadRequestException(
        `Session has no content to generate diagrams from: ${sessionId}`,
      );
    }

    return parts.join("\n\n");
  }

  /**
   * 세션의 파싱된 파일 내용 조합
   */
  private async getFileContext(sessionId: string): Promise<string> {
    const files = await this.db.query.agentDeskFiles.findMany({
      where: eq(agentDeskFiles.sessionId, sessionId),
    });

    const parsedFiles = files.filter((f) => f.parsedContent);
    if (parsedFiles.length === 0) return "";

    return parsedFiles
      .map((f) => `### ${f.originalName}\n${f.parsedContent}`)
      .join("\n\n---\n\n");
  }

  /**
   * LLM 응답에서 JSON 파싱 + 필수 키 런타임 검증
   */
  private parseJsonResponse<T>(
    response: string,
    sessionId: string,
    requiredKeys: string[] = [],
  ): T {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error("Failed to extract JSON from diagram response", {
        "agent_desk.session_id": sessionId,
        "error.message": "No JSON found in response",
      });
      throw new BadRequestException(
        "LLM response did not contain valid JSON for diagram generation",
      );
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      for (const key of requiredKeys) {
        if (!(key in parsed)) {
          logger.error("Missing required key in diagram JSON", {
            "agent_desk.session_id": sessionId,
            "error.message": `Missing required key: ${key}`,
          });
          throw new BadRequestException(
            `LLM diagram response missing required field: ${key}`,
          );
        }
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error("Failed to parse diagram JSON", {
        "agent_desk.session_id": sessionId,
        "error.message": error instanceof Error ? error.message : String(error),
      });
      throw new BadRequestException(
        "Failed to parse LLM diagram response as JSON",
      );
    }
  }
}
