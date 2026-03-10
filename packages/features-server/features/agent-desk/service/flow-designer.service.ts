import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import { LLMService } from "../../../features/ai";
import { randomUUID } from "crypto";
import type { FlowEdge, ScreenDetail } from "../types";

const logger = createLogger("agent-desk");

// ============================================================================
// Types
// ============================================================================

export interface FlowScreen {
  id: string;
  name: string;
  order: number;
  description: string;
  wireframeType: string;
  wireframeMermaid: string;
  nextScreenIds: string[];
  metadata: Record<string, unknown>;
  detail?: ScreenDetail;
}

export interface FlowData {
  screens: FlowScreen[];
  currentScreenIndex: number;
  edges?: FlowEdge[];
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class FlowDesignerService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly llmService: LLMService,
  ) {}

  async getFlowData(sessionId: string): Promise<FlowData> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
      columns: { id: true, flowData: true },
    });

    if (!session) throw new NotFoundException(`Session not found: ${sessionId}`);

    return (session.flowData as FlowData) ?? { screens: [], currentScreenIndex: 0 };
  }

  async addScreen(sessionId: string, name: string, afterScreenId?: string): Promise<FlowData> {
    const flowData = await this.getFlowData(sessionId);

    const newScreen: FlowScreen = {
      id: randomUUID(),
      name,
      order: flowData.screens.length,
      description: "",
      wireframeType: "",
      wireframeMermaid: "",
      nextScreenIds: [],
      metadata: {},
    };

    if (afterScreenId) {
      const idx = flowData.screens.findIndex((s) => s.id === afterScreenId);
      if (idx === -1) throw new BadRequestException(`Screen not found: ${afterScreenId}`);
      flowData.screens.splice(idx + 1, 0, newScreen);
      flowData.screens[idx]!.nextScreenIds.push(newScreen.id);
    } else {
      if (flowData.screens.length > 0) {
        flowData.screens[flowData.screens.length - 1]!.nextScreenIds.push(newScreen.id);
      }
      flowData.screens.push(newScreen);
    }

    flowData.screens.forEach((s, i) => {
      s.order = i;
    });
    flowData.currentScreenIndex = flowData.screens.findIndex((s) => s.id === newScreen.id);

    await this.saveFlowData(sessionId, flowData);

    logger.info("Screen added", {
      "agent_desk.session_id": sessionId,
      "agent_desk.screen_id": newScreen.id,
      "agent_desk.screen_name": name,
    });

    return flowData;
  }

  async updateScreen(
    sessionId: string,
    screenId: string,
    updates: Partial<Omit<FlowScreen, "id" | "order">>,
  ): Promise<FlowData> {
    const flowData = await this.getFlowData(sessionId);
    const screen = flowData.screens.find((s) => s.id === screenId);
    if (!screen) throw new NotFoundException(`Screen not found: ${screenId}`);

    const { name, description, wireframeType, wireframeMermaid, nextScreenIds, metadata, detail } = updates;
    if (name !== undefined) screen.name = name;
    if (description !== undefined) screen.description = description;
    if (wireframeType !== undefined) screen.wireframeType = wireframeType;
    if (wireframeMermaid !== undefined) screen.wireframeMermaid = wireframeMermaid;
    if (nextScreenIds !== undefined) screen.nextScreenIds = nextScreenIds;
    if (metadata !== undefined) screen.metadata = metadata;
    if (detail !== undefined) screen.detail = { ...screen.detail, ...detail };

    await this.saveFlowData(sessionId, flowData);

    logger.info("Screen updated", {
      "agent_desk.session_id": sessionId,
      "agent_desk.screen_id": screenId,
    });

    return flowData;
  }

  async removeScreen(sessionId: string, screenId: string): Promise<FlowData> {
    const flowData = await this.getFlowData(sessionId);
    const idx = flowData.screens.findIndex((s) => s.id === screenId);
    if (idx === -1) throw new NotFoundException(`Screen not found: ${screenId}`);

    flowData.screens.splice(idx, 1);
    for (const screen of flowData.screens) {
      screen.nextScreenIds = screen.nextScreenIds.filter((id) => id !== screenId);
    }
    flowData.screens.forEach((s, i) => {
      s.order = i;
    });
    if (flowData.currentScreenIndex >= flowData.screens.length) {
      flowData.currentScreenIndex = Math.max(0, flowData.screens.length - 1);
    }

    await this.saveFlowData(sessionId, flowData);

    logger.info("Screen removed", {
      "agent_desk.session_id": sessionId,
      "agent_desk.screen_id": screenId,
    });

    return flowData;
  }

  async updateSettings(
    sessionId: string,
    settings: { platform?: string; designTheme?: string },
  ): Promise<void> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
      columns: { id: true },
    });
    if (!session) throw new NotFoundException(`Session not found: ${sessionId}`);

    await this.db
      .update(agentDeskSessions)
      .set(settings)
      .where(eq(agentDeskSessions.id, sessionId));
  }

  async saveFlowData(sessionId: string, flowData: FlowData): Promise<void> {
    await this.db
      .update(agentDeskSessions)
      .set({ flowData })
      .where(eq(agentDeskSessions.id, sessionId));
  }

  generateFlowchartMermaid(flowData: FlowData): string {
    if (flowData.screens.length === 0) return "graph TD\n  empty[화면 없음]";

    const lines = ["graph TD"];
    for (const screen of flowData.screens) {
      const nodeId = `s_${screen.order}`;
      const safeName = screen.name.replace(/["\[\](){}|<>\\]/g, "");
      lines.push(`  ${nodeId}["${safeName}"]`);
    }
    for (const screen of flowData.screens) {
      const fromId = `s_${screen.order}`;
      for (const nextId of screen.nextScreenIds) {
        const nextScreen = flowData.screens.find((s) => s.id === nextId);
        if (nextScreen) {
          lines.push(`  ${fromId} --> s_${nextScreen.order}`);
        }
      }
    }
    return lines.join("\n");
  }

  async completeDesign(sessionId: string, model?: string): Promise<string> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });
    if (!session) throw new NotFoundException(`Session not found: ${sessionId}`);

    const flowData = (session.flowData as FlowData) ?? { screens: [], currentScreenIndex: 0 };
    const flowchartMermaid = this.generateFlowchartMermaid(flowData);

    const prompt = this.buildScreenDefinitionPrompt(session, flowData, flowchartMermaid);

    const draft = await this.llmService.chatCompletion(
      [
        { role: "system", content: "당신은 화면정의서 작성 전문가입니다. Markdown과 Mermaid 다이어그램을 활용하여 구조화된 문서를 작성합니다." },
        { role: "user", content: prompt },
      ],
      { model },
    );

    await this.db
      .update(agentDeskSessions)
      .set({
        status: "analyzed",
        spec: draft,
        diagrams: [
          {
            type: "flowchart",
            title: "화면 흐름도",
            description: "전체 화면 연결 구조",
            mermaidCode: flowchartMermaid,
          },
        ],
      })
      .where(eq(agentDeskSessions.id, sessionId));

    logger.info("Flow design completed", {
      "agent_desk.session_id": sessionId,
      "agent_desk.screen_count": flowData.screens.length,
    });

    return draft;
  }

  private buildScreenDefinitionPrompt(
    session: Record<string, unknown>,
    flowData: FlowData,
    flowchartMermaid: string,
  ): string {
    const screenDetails = flowData.screens
      .map((s, i) => {
        const nextNames = s.nextScreenIds
          .map((id) => flowData.screens.find((sc) => sc.id === id)?.name)
          .filter(Boolean)
          .join(", ");

        return `
### ${i + 1}. ${s.name}
- **와이어프레임 타입**: ${s.wireframeType || "미정"}
- **설명**: ${s.description || "미입력"}
- **다음 화면**: ${nextNames || "없음 (종료)"}
- **상세 메타데이터**: ${JSON.stringify(s.metadata)}`;
      })
      .join("\n");

    return `아래 화면 흐름 정보를 바탕으로 화면정의서 초안을 Markdown으로 작성해주세요.

## 프로젝트 정보
- 플랫폼: ${(session.platform as string) ?? "미정"}
- 디자인 테마: ${(session.designTheme as string) ?? "미정"}
- 제목: ${(session.title as string) ?? "무제"}

## 전체 플로우차트
\`\`\`mermaid
${flowchartMermaid}
\`\`\`

## 화면 상세
${screenDetails}

## 요청사항
각 화면에 대해 다음을 포함하여 화면정의서 초안을 작성하세요:
1. 화면 이름, 경로, 목적
2. 주요 UI 요소 (헤더, 콘텐츠, 버튼 등)
3. 사용자 인터랙션 (클릭, 입력, 스와이프 등)
4. 다음 화면 연결 (조건 포함)
5. 에러/예외 상태
6. 와이어프레임 설명

Markdown 테이블과 Mermaid 다이어그램을 활용하여 구조화해주세요.`;
  }
}
