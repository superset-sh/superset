import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions, agentDeskNormalizedRequirements } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import { LLMService } from "../../../features/ai";
import type { z } from "zod";
import type {
  ImplementationHandoff,
  ChatMessage,
} from "../types";
import type { FlowData } from "./flow-designer.service";
import type { generateImplementationHandoffSchema } from "../dto/flow-agent.dto";
import { SessionService } from "./session.service";

type GenerateImplementationHandoffDto = z.infer<typeof generateImplementationHandoffSchema>;

const logger = createLogger("agent-desk");

const HANDOFF_SYSTEM_PROMPT = `당신은 구현 인계 패키지를 생성하는 전문가입니다.
화면 흐름 데이터와 요구사항을 분석하여 개발자가 바로 구현에 착수할 수 있는 패키지를 만듭니다.

응답은 반드시 다음 JSON 형식으로:
{
  "routerMap": [
    { "screenId": "...", "screenName": "...", "routePath": "/...", "parentRoute": "rootRoute", "authRule": "public|protected|admin" }
  ],
  "screenSpecs": [
    {
      "screenId": "...", "screenName": "...", "wireframeType": "...", "description": "...",
      "requirements": ["req-id-1"],
      "stateManagement": { "serverState": [], "clientState": [], "formState": [] }
    }
  ],
  "navigationRules": [
    { "fromScreenId": "...", "toScreenId": "...", "trigger": "...", "conditionLabel": "...", "transitionType": "navigate", "dataPassingStrategy": "url_param|query_string|state|context" }
  ],
  "implementationNotes": ["note1", "note2"]
}

규칙:
- screenId는 flowData에서 가져온 실제 UUID를 사용하세요.
- routePath는 kebab-case로 생성하세요.
- stateManagement는 TanStack Query(serverState), Jotai(clientState), React Hook Form(formState) 기준으로 분류하세요.`;

@Injectable()
export class HandoffComposerService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly sessionService: SessionService,
    private readonly llmService: LLMService,
  ) {}

  async generateHandoff(
    input: GenerateImplementationHandoffDto,
    userId: string,
  ): Promise<ImplementationHandoff> {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, input.sessionId),
      columns: { id: true, flowData: true, title: true },
    });

    if (!session) throw new NotFoundException(`Session not found: ${input.sessionId}`);

    const flowData = (session.flowData as FlowData) ?? { screens: [], currentScreenIndex: 0, edges: [] };

    if (flowData.screens.length === 0) {
      throw new NotFoundException("화면 데이터가 없습니다. 먼저 화면 후보를 생성해주세요.");
    }

    const requirements = await this.db.query.agentDeskNormalizedRequirements.findMany({
      where: eq(agentDeskNormalizedRequirements.sessionId, input.sessionId),
    });

    const requirementContext = requirements
      .map((r) => `[${r.category}] (ID: ${r.id}) ${r.summary}`)
      .join("\n");

    const flowContext = this.buildFlowContext(flowData);

    const chatMessages: ChatMessage[] = [
      { role: "system", content: HANDOFF_SYSTEM_PROMPT },
      {
        role: "user",
        content: `다음 화면 흐름과 요구사항을 기반으로 구현 인계 패키지를 생성해주세요.\n\n## 화면 흐름\n${flowContext}\n\n## 요구사항\n${requirementContext || "(요구사항 없음)"}`,
      },
    ];

    const response = await this.llmService.chatCompletion(chatMessages, { jsonMode: true });

    const handoff = this.parseHandoffResponse(response, input.sessionId);

    await this.storeHandoff(input.sessionId, handoff);

    logger.info("Implementation handoff generated", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.route_count": handoff.routerMap.length,
      "agent_desk.screen_spec_count": handoff.screenSpecs.length,
    });

    return handoff;
  }

  private buildFlowContext(flowData: FlowData): string {
    const parts: string[] = [];

    for (const screen of flowData.screens) {
      parts.push(`### ${screen.name} (${screen.wireframeType})`);
      parts.push(`설명: ${screen.description}`);
      if (screen.detail) {
        const d = screen.detail;
        if (d.screenGoal) parts.push(`목적: ${d.screenGoal}`);
        if (d.routePath) parts.push(`경로: ${d.routePath}`);
        if (d.primaryUser) parts.push(`사용자: ${d.primaryUser}`);
        if (d.keyElements?.length) parts.push(`핵심 요소: ${d.keyElements.join(", ")}`);
        if (d.inputs?.length) parts.push(`입력: ${d.inputs.join(", ")}`);
        if (d.actions?.length) parts.push(`액션: ${d.actions.join(", ")}`);
        if (d.states?.length) parts.push(`상태: ${d.states.join(", ")}`);
      }
      parts.push("");
    }

    if (flowData.edges?.length) {
      parts.push("### 전이");
      for (const edge of flowData.edges) {
        const from = flowData.screens.find((s) => s.id === edge.fromScreenId)?.name ?? "?";
        const to = flowData.screens.find((s) => s.id === edge.toScreenId)?.name ?? "?";
        parts.push(`- ${from} → ${to}: ${edge.conditionLabel} (${edge.transitionType})`);
      }
    }

    return parts.join("\n");
  }

  private parseHandoffResponse(response: string, sessionId: string): ImplementationHandoff {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return this.buildFallbackHandoff(sessionId);
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        sessionId,
        generatedAt: new Date().toISOString(),
        routerMap: parsed.routerMap ?? [],
        screenSpecs: parsed.screenSpecs ?? [],
        navigationRules: parsed.navigationRules ?? [],
        implementationNotes: parsed.implementationNotes ?? [],
        artifacts: {},
      };
    } catch {
      return this.buildFallbackHandoff(sessionId);
    }
  }

  private buildFallbackHandoff(sessionId: string): ImplementationHandoff {
    return {
      sessionId,
      generatedAt: new Date().toISOString(),
      routerMap: [],
      screenSpecs: [],
      navigationRules: [],
      implementationNotes: ["LLM 응답 파싱 실패로 기본 패키지가 생성되었습니다."],
      artifacts: {},
    };
  }

  private async storeHandoff(sessionId: string, handoff: ImplementationHandoff) {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
      columns: { id: true, metadata: true },
    });

    const metadata = (session?.metadata as Record<string, unknown>) ?? {};
    await this.db
      .update(agentDeskSessions)
      .set({ metadata: { ...metadata, implementationHandoff: handoff } })
      .where(eq(agentDeskSessions.id, sessionId));
  }
}
