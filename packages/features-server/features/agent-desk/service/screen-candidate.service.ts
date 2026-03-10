import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions, agentDeskNormalizedRequirements } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import { LLMService } from "../../../features/ai";
import type { FlowEdge, ScreenDetail, PanelState, ChatMessage } from "../types";
import type { FlowData, FlowScreen } from "./flow-designer.service";
import type { GenerateScreenCandidatesDto } from "../dto/screen-candidate.dto";
import type { UpdateScreenCandidateDto } from "../dto/screen-candidate.dto";
import type { UpdateFlowEdgeDto } from "../dto/screen-candidate.dto";
import type { AddFlowEdgeDto } from "../dto/screen-candidate.dto";
import type { DeleteFlowEdgeDto } from "../dto/screen-candidate.dto";
import type { SelectCanvasNodeDto } from "../dto/screen-candidate.dto";
import type { SelectCanvasEdgeDto } from "../dto/screen-candidate.dto";
import { SessionService } from "./session.service";

const logger = createLogger("agent-desk");

const SCREEN_CANDIDATE_SYSTEM_PROMPT = `당신은 화면 설계 전문가입니다.
정규화된 요구사항을 분석하여 필요한 화면(Screen) 목록과 화면 간 전이(Edge)를 생성합니다.

응답은 반드시 다음 JSON 형식으로:
{
  "screens": [
    {
      "id": "uuid-v4 형식",
      "name": "화면 이름",
      "description": "화면 설명",
      "wireframeType": "form|list|detail|dashboard|modal|empty",
      "detail": {
        "screenGoal": "화면의 목적",
        "primaryUser": "주 사용자",
        "routePath": "/경로",
        "keyElements": ["헤더", "검색바", "카드 리스트"],
        "inputs": ["이메일", "비밀번호"],
        "actions": ["로그인", "회원가입 이동"],
        "states": ["로딩", "에러", "빈 상태"],
        "entryConditions": ["비로그인 상태"],
        "exitConditions": ["로그인 성공"],
        "sourceRequirementIds": ["요구사항ID"]
      }
    }
  ],
  "edges": [
    {
      "id": "uuid-v4 형식",
      "fromScreenId": "출발 화면 ID",
      "toScreenId": "도착 화면 ID",
      "conditionLabel": "전이 조건 설명",
      "transitionType": "navigate|redirect|modal|conditional",
      "sourceRequirementIds": ["관련 요구사항 ID"]
    }
  ],
  "flowchartMermaid": "graph TD\\n  A[화면1] --> B[화면2]\\n..."
}

UUID는 하이픈 포함 36자 형식으로 생성하세요 (예: 550e8400-e29b-41d4-a716-446655440000).
모든 ID는 고유해야 합니다.
edges의 fromScreenId와 toScreenId는 screens 배열에 존재하는 ID를 참조해야 합니다.

중요: edges는 반드시 포함해야 합니다. 각 화면 간의 이동 경로(네비게이션)를 빠짐없이 정의하세요.
최소한 각 화면에 1개 이상의 edge(들어오거나 나가는)가 있어야 합니다.
화면 수가 N개이면 edges는 최소 N-1개 이상이어야 합니다.
screens를 먼저 모두 정의한 후, edges를 반드시 작성하세요.`;

@Injectable()
export class ScreenCandidateService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly sessionService: SessionService,
    private readonly llmService: LLMService,
  ) {}

  async generateCandidates(input: GenerateScreenCandidatesDto, userId: string) {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    // Load normalized requirements
    const requirements = await this.db.query.agentDeskNormalizedRequirements.findMany({
      where: eq(agentDeskNormalizedRequirements.sessionId, input.sessionId),
    });

    if (requirements.length === 0) {
      throw new BadRequestException("정규화된 요구사항이 없습니다. 먼저 요구사항 정규화를 실행해주세요.");
    }

    // Build requirement context
    const requirementContext = requirements
      .map((r) => `- [${r.category}] (ID: ${r.id}) ${r.summary}${r.detail ? `\n  상세: ${r.detail}` : ""}`)
      .join("\n");

    const chatMessages: ChatMessage[] = [
      { role: "system", content: SCREEN_CANDIDATE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `다음 정규화된 요구사항을 분석하여 필요한 화면 목록과 화면 간 전이를 생성해주세요:\n\n${requirementContext}`,
      },
    ];

    const response = await this.llmService.chatCompletion(
      chatMessages,
      { ...(input.model ? { model: input.model } : {}), jsonMode: true, maxTokens: 32768 },
    );

    // Parse JSON response — 전체 응답에서 JSON 추출 시도
    let rawJson = response.trim();
    // 코드블록 제거
    const codeBlockMatch = rawJson.match(/^```(?:json)?\s*\n?([\s\S]*?)(?:\n?\s*```)?$/);
    if (codeBlockMatch) {
      rawJson = codeBlockMatch[1]!.trim();
    }
    // 첫 번째 { 찾기
    const firstBrace = rawJson.indexOf("{");
    if (firstBrace < 0) {
      logger.error("Failed to extract JSON from screen candidate response", {
        "agent_desk.session_id": input.sessionId,
        "error.message": "No JSON found in response",
      });
      throw new BadRequestException("LLM 응답에서 유효한 JSON을 추출할 수 없습니다");
    }
    rawJson = rawJson.substring(firstBrace);

    let parsed: {
      screens: Array<{
        id: string;
        name: string;
        description: string;
        wireframeType: string;
        detail?: ScreenDetail;
      }>;
      edges: Array<{
        id: string;
        fromScreenId: string;
        toScreenId: string;
        conditionLabel: string;
        transitionType: "navigate" | "redirect" | "modal" | "conditional";
        sourceRequirementIds: string[];
      }>;
      flowchartMermaid?: string;
    };

    try {
      parsed = JSON.parse(rawJson);
    } catch (parseErr) {
      // 잘린 JSON 복구 시도: 끝에서부터 마지막 완전한 객체/배열 경계를 찾음
      try {
        parsed = this.recoverTruncatedJson(rawJson);
        logger.warn("Recovered truncated JSON for screen candidates", {
          "agent_desk.session_id": input.sessionId,
        });
      } catch {
        logger.error("Failed to parse screen candidate JSON", {
          "agent_desk.session_id": input.sessionId,
          "error.message": parseErr instanceof Error ? parseErr.message : "Invalid JSON format",
          "agent_desk.response_preview": response.substring(0, 500),
        });
        throw new BadRequestException("LLM 응답 JSON 파싱에 실패했습니다");
      }
    }

    // Build FlowScreen array with nextScreenIds for backward compat
    // edges가 없으면 빈 배열로 대체 (잘린 JSON recovery 시 edges 누락 가능)
    if (!Array.isArray(parsed.edges)) {
      parsed.edges = [];
    }
    if (!Array.isArray(parsed.screens)) {
      parsed.screens = [];
    }

    // 2-pass: edges가 누락된 경우 별도 LLM 호출로 edges 생성
    if (parsed.screens.length > 0 && parsed.edges.length === 0) {
      logger.info("Edges missing from initial response, generating edges separately", {
        "agent_desk.session_id": input.sessionId,
        "agent_desk.screen_count": parsed.screens.length,
      });
      const edgesResult = await this.generateEdgesSeparately(parsed.screens, requirementContext, input.model);
      parsed.edges = edgesResult;
    }

    const edgesByFromScreen = new Map<string, string[]>();
    for (const edge of parsed.edges) {
      const existing = edgesByFromScreen.get(edge.fromScreenId) ?? [];
      existing.push(edge.toScreenId);
      edgesByFromScreen.set(edge.fromScreenId, existing);
    }

    const screens: FlowScreen[] = parsed.screens.map((s, i) => ({
      id: s.id,
      name: s.name,
      order: i,
      description: s.description,
      wireframeType: s.wireframeType,
      wireframeMermaid: "",
      nextScreenIds: edgesByFromScreen.get(s.id) ?? [],
      metadata: {},
      detail: s.detail,
    }));

    const edges: FlowEdge[] = parsed.edges.map((e) => ({
      id: e.id,
      fromScreenId: e.fromScreenId,
      toScreenId: e.toScreenId,
      conditionLabel: e.conditionLabel,
      transitionType: e.transitionType,
      sourceRequirementIds: e.sourceRequirementIds ?? [],
    }));

    // Save to session flowData
    const flowData: FlowData = {
      screens,
      currentScreenIndex: 0,
      edges,
    };

    await this.db
      .update(agentDeskSessions)
      .set({ flowData })
      .where(eq(agentDeskSessions.id, input.sessionId));

    logger.info("Screen candidates generated", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.screen_count": screens.length,
      "agent_desk.edge_count": edges.length,
    });

    return { screens, edges, flowchartMermaid: parsed.flowchartMermaid ?? "" };
  }

  async updateScreenDetail(input: UpdateScreenCandidateDto, userId: string) {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, input.sessionId),
      columns: { id: true, flowData: true },
    });

    if (!session) throw new NotFoundException(`Session not found: ${input.sessionId}`);

    const flowData = (session.flowData as FlowData) ?? { screens: [], currentScreenIndex: 0 };
    const screen = flowData.screens.find((s) => s.id === input.screenId);

    if (!screen) throw new NotFoundException(`Screen not found: ${input.screenId}`);

    // Update the detail field
    const { sessionId, screenId, ...detailUpdates } = input;
    screen.detail = { ...screen.detail, ...detailUpdates };

    await this.db
      .update(agentDeskSessions)
      .set({ flowData })
      .where(eq(agentDeskSessions.id, input.sessionId));

    logger.info("Screen detail updated", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.screen_id": input.screenId,
    });

    return flowData;
  }

  async updateFlowEdge(input: UpdateFlowEdgeDto, userId: string) {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, input.sessionId),
      columns: { id: true, flowData: true },
    });

    if (!session) throw new NotFoundException(`Session not found: ${input.sessionId}`);

    const flowData = (session.flowData as FlowData) ?? { screens: [], currentScreenIndex: 0, edges: [] };
    const edges = flowData.edges ?? [];
    const edge = edges.find((e) => e.id === input.edgeId);

    if (!edge) throw new NotFoundException(`Edge not found: ${input.edgeId}`);

    if (input.conditionLabel !== undefined) edge.conditionLabel = input.conditionLabel;
    if (input.transitionType !== undefined) edge.transitionType = input.transitionType;

    flowData.edges = edges;

    await this.db
      .update(agentDeskSessions)
      .set({ flowData })
      .where(eq(agentDeskSessions.id, input.sessionId));

    logger.info("Flow edge updated", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.edge_id": input.edgeId,
    });

    return flowData;
  }

  async addFlowEdge(input: AddFlowEdgeDto, userId: string) {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, input.sessionId),
      columns: { id: true, flowData: true },
    });

    if (!session) throw new NotFoundException(`Session not found: ${input.sessionId}`);

    const flowData = (session.flowData as FlowData) ?? { screens: [], currentScreenIndex: 0, edges: [] };
    const edges = flowData.edges ?? [];

    const newEdge: FlowEdge = {
      id: crypto.randomUUID(),
      fromScreenId: input.fromScreenId,
      toScreenId: input.toScreenId,
      conditionLabel: input.conditionLabel ?? "",
      transitionType: input.transitionType ?? "navigate",
      sourceRequirementIds: [],
    };

    edges.push(newEdge);
    flowData.edges = edges;

    await this.db
      .update(agentDeskSessions)
      .set({ flowData })
      .where(eq(agentDeskSessions.id, input.sessionId));

    logger.info("Flow edge added", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.edge_id": newEdge.id,
    });

    return flowData;
  }

  async deleteFlowEdge(input: DeleteFlowEdgeDto, userId: string) {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, input.sessionId),
      columns: { id: true, flowData: true },
    });

    if (!session) throw new NotFoundException(`Session not found: ${input.sessionId}`);

    const flowData = (session.flowData as FlowData) ?? { screens: [], currentScreenIndex: 0, edges: [] };
    const edges = flowData.edges ?? [];
    const idx = edges.findIndex((e) => e.id === input.edgeId);

    if (idx === -1) throw new NotFoundException(`Edge not found: ${input.edgeId}`);

    edges.splice(idx, 1);
    flowData.edges = edges;

    await this.db
      .update(agentDeskSessions)
      .set({ flowData })
      .where(eq(agentDeskSessions.id, input.sessionId));

    logger.info("Flow edge deleted", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.edge_id": input.edgeId,
    });

    return flowData;
  }

  async selectNode(input: SelectCanvasNodeDto, userId: string): Promise<PanelState> {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    return {
      selectedNodeId: input.nodeId,
      selectedEdgeId: null,
      mode: input.panelMode,
      activeTab: "overview",
      dirty: false,
    };
  }

  async selectEdge(input: SelectCanvasEdgeDto, userId: string): Promise<PanelState> {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    return {
      selectedNodeId: null,
      selectedEdgeId: input.edgeId,
      mode: "view",
      activeTab: "transition",
      dirty: false,
    };
  }

  /**
   * 2-pass: 화면 목록만으로 edges를 별도 생성하는 LLM 호출
   */
  private async generateEdgesSeparately(
    screens: Array<{ id: string; name: string; description: string; wireframeType: string }>,
    requirementContext: string,
    model?: string,
  ): Promise<Array<{
    id: string;
    fromScreenId: string;
    toScreenId: string;
    conditionLabel: string;
    transitionType: "navigate" | "redirect" | "modal" | "conditional";
    sourceRequirementIds: string[];
  }>> {
    const screenList = screens
      .map((s) => `  - ID: ${s.id} | 이름: ${s.name} | 유형: ${s.wireframeType} | 설명: ${s.description}`)
      .join("\n");

    const edgePrompt = `다음 화면 목록을 보고 화면 간 전이(edges)를 생성하세요.

화면 목록:
${screenList}

요구사항 컨텍스트:
${requirementContext}

응답은 반드시 다음 JSON 형식으로만 작성하세요 (다른 텍스트 없이):
{
  "edges": [
    {
      "id": "uuid-v4 형식",
      "fromScreenId": "출발 화면 ID (위 목록의 ID 사용)",
      "toScreenId": "도착 화면 ID (위 목록의 ID 사용)",
      "conditionLabel": "전이 조건 설명",
      "transitionType": "navigate|redirect|modal|conditional",
      "sourceRequirementIds": []
    }
  ]
}

규칙:
- 모든 화면에 최소 1개 이상의 edge(들어오거나 나가는)가 있어야 합니다
- 화면 수가 ${screens.length}개이므로 edges는 최소 ${screens.length - 1}개 이상이어야 합니다
- fromScreenId와 toScreenId는 반드시 위 화면 목록의 ID를 사용하세요
- UUID는 하이픈 포함 36자 형식 (예: 550e8400-e29b-41d4-a716-446655440000)`;

    const chatMessages: ChatMessage[] = [
      { role: "system", content: "당신은 화면 전이(navigation flow) 설계 전문가입니다. JSON으로만 응답합니다." },
      { role: "user", content: edgePrompt },
    ];

    const response = await this.llmService.chatCompletion(
      chatMessages,
      model ? { model, jsonMode: true } : { jsonMode: true },
    );

    try {
      let json = response.trim();
      const codeBlock = json.match(/^```(?:json)?\s*\n?([\s\S]*?)(?:\n?\s*```)?$/);
      if (codeBlock) json = codeBlock[1]!.trim();
      const firstBrace = json.indexOf("{");
      if (firstBrace >= 0) json = json.substring(firstBrace);

      let result: { edges: any[] };
      try {
        result = JSON.parse(json);
      } catch {
        result = this.recoverTruncatedJson(json);
      }

      const edges = Array.isArray(result.edges) ? result.edges : [];
      logger.info("Edges generated separately", {
        "agent_desk.edge_count": edges.length,
      });
      return edges;
    } catch (err) {
      logger.error("Failed to generate edges separately", {
        "error.message": err instanceof Error ? err.message : "Unknown error",
      });
      return [];
    }
  }

  /**
   * 잘린 JSON을 string-aware 스택 기반으로 복구.
   * screens 배열 내 마지막으로 완전히 닫힌 객체까지 잘라내고 나머지를 닫는다.
   */
  private recoverTruncatedJson(raw: string): any {
    // 이미 유효한 JSON이면 그대로 반환
    try {
      return JSON.parse(raw);
    } catch {
      // 복구 시도
    }

    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let screensArrayDepth = -1;
    let lastCompleteElementEnd = -1;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];

      if (escaped) { escaped = false; continue; }
      if (ch === "\\" && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === "{" || ch === "[") {
        stack.push(ch);
        if (ch === "[" && screensArrayDepth === -1 && stack.length === 2) {
          screensArrayDepth = stack.length;
        }
      } else if (ch === "}" || ch === "]") {
        stack.pop();
        if (ch === "}" && stack.length === screensArrayDepth) {
          lastCompleteElementEnd = i;
        }
      }
    }

    if (lastCompleteElementEnd === -1) {
      throw new Error("Could not recover truncated JSON");
    }

    let repaired = raw.slice(0, lastCompleteElementEnd + 1);

    // 남은 열린 bracket을 string-aware로 닫기
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

    while (closeStack.length > 0) {
      repaired += closeStack.pop();
    }

    return JSON.parse(repaired);
  }
}
