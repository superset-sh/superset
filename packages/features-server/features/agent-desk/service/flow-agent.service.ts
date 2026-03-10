import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import { LLMService } from "../../../features/ai";
import type {
  AiSuggestion,
  FlowAgentResponse,
  StructuredQuestion,
  FlowEdge,
  ScreenDetail,
  ChatMessage,
} from "../types";
import type { FlowData, FlowScreen } from "./flow-designer.service";
import type { z } from "zod";
import type { askFlowAgentSchema, applyAiSuggestionSchema } from "../dto/flow-agent.dto";
import { SessionService } from "./session.service";

const logger = createLogger("agent-desk");

type AskFlowAgentDto = z.infer<typeof askFlowAgentSchema>;
type ApplyAiSuggestionDto = z.infer<typeof applyAiSuggestionSchema>;

const FLOW_AGENT_SYSTEM_PROMPT = `당신은 화면 흐름 설계를 돕는 AI 에이전트입니다.
사용자의 질문에 답하면서 다음을 수행합니다:

1. **구조화 질문**: 부족한 정보나 충돌 지점을 발견하면 구조화 질문을 생성합니다.
   - slot: role(역할), goal(목표), input(입력), exception(예외), branch(분기)
2. **제안 카드**: 화면 추가/수정/삭제, 전이 변경 등 구조적 변경안을 제안합니다.

응답은 반드시 다음 JSON 형식으로:
{
  "reply": "자연어 응답 텍스트",
  "questions": [
    {
      "id": "uuid-v4",
      "slot": "role|goal|input|exception|branch",
      "question": "질문 내용",
      "context": "질문 배경 (선택)",
      "targetScreenId": "관련 화면 ID (선택)"
    }
  ],
  "suggestions": [
    {
      "id": "uuid-v4",
      "type": "add_screen|remove_screen|update_screen|add_edge|update_edge|update_detail",
      "title": "제안 제목",
      "description": "제안 설명",
      "previewData": { ... },
      "affectedNodeIds": ["화면ID1"]
    }
  ]
}

UUID는 하이픈 포함 36자 형식으로 생성하세요.
reply는 항상 포함하고, questions와 suggestions는 필요할 때만 포함하세요.
suggestions의 previewData는 적용 시 변경될 데이터의 미리보기입니다.`;

@Injectable()
export class FlowAgentService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly sessionService: SessionService,
    private readonly llmService: LLMService,
  ) {}

  async askFlowAgent(input: AskFlowAgentDto, userId: string): Promise<FlowAgentResponse> {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, input.sessionId),
      columns: { id: true, flowData: true },
    });

    if (!session) throw new NotFoundException(`Session not found: ${input.sessionId}`);

    const flowData = (session.flowData as FlowData) ?? {
      screens: [],
      currentScreenIndex: 0,
      edges: [],
    };
    const messages = await this.sessionService.getMessages(input.sessionId);

    const flowContext = this.buildFlowContext(flowData, input.currentScreenId);
    const history: ChatMessage[] = messages.slice(-10).map((m) => ({
      role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const chatMessages: ChatMessage[] = [
      { role: "system", content: FLOW_AGENT_SYSTEM_PROMPT },
      { role: "system", content: `현재 화면 흐름 상태:\n${flowContext}` },
      ...history,
      { role: "user", content: input.message },
    ];

    const response = await this.llmService.chatCompletion(chatMessages, { jsonMode: true });

    await this.sessionService.addMessage(input.sessionId, "user", input.message);

    const parsed = this.parseAgentResponse(response);

    await this.sessionService.addMessage(input.sessionId, "agent", parsed.reply);

    if (parsed.suggestions.length > 0) {
      await this.storeSuggestions(input.sessionId, parsed.suggestions);
    }

    logger.info("Flow agent responded", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.question_count": parsed.questions.length,
      "agent_desk.suggestion_count": parsed.suggestions.length,
    });

    return parsed;
  }

  async applyAiSuggestion(input: ApplyAiSuggestionDto, userId: string) {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, input.sessionId),
      columns: { id: true, flowData: true, metadata: true },
    });

    if (!session) throw new NotFoundException(`Session not found: ${input.sessionId}`);

    const metadata = (session.metadata as Record<string, unknown>) ?? {};
    const storedSuggestions = (metadata.pendingSuggestions as AiSuggestion[]) ?? [];
    const suggestion = storedSuggestions.find((s) => s.id === input.suggestionId);

    if (!suggestion) throw new NotFoundException(`Suggestion not found: ${input.suggestionId}`);

    if (input.action === "ignore") {
      suggestion.status = "ignored";
      await this.updateSuggestionStatus(input.sessionId, metadata, storedSuggestions);
      logger.info("AI suggestion ignored", {
        "agent_desk.session_id": input.sessionId,
        "agent_desk.suggestion_id": input.suggestionId,
      });
      return { applied: false, flowData: session.flowData };
    }

    const flowData = (session.flowData as FlowData) ?? {
      screens: [],
      currentScreenIndex: 0,
      edges: [],
    };
    const previewData =
      input.action === "modify" && input.modifiedData
        ? { ...suggestion.previewData, ...input.modifiedData }
        : suggestion.previewData;

    this.applySuggestionToFlowData(flowData, suggestion.type, previewData);
    suggestion.status = "applied";

    await this.db
      .update(agentDeskSessions)
      .set({ flowData, metadata: { ...metadata, pendingSuggestions: storedSuggestions } })
      .where(eq(agentDeskSessions.id, input.sessionId));

    logger.info("AI suggestion applied", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.suggestion_id": input.suggestionId,
      "agent_desk.suggestion_type": suggestion.type,
    });

    return { applied: true, flowData };
  }

  /* Helpers */

  private buildFlowContext(flowData: FlowData, currentScreenId?: string): string {
    const parts: string[] = [];
    parts.push(`화면 수: ${flowData.screens.length}`);
    parts.push(`엣지 수: ${flowData.edges?.length ?? 0}`);

    if (flowData.screens.length > 0) {
      parts.push("\n화면 목록:");
      for (const screen of flowData.screens) {
        const selected = screen.id === currentScreenId ? " [선택됨]" : "";
        parts.push(
          `- ${screen.name} (${screen.wireframeType})${selected}: ${screen.description}`,
        );
        if (screen.detail) {
          if (screen.detail.routePath) parts.push(`  경로: ${screen.detail.routePath}`);
          if (screen.detail.screenGoal) parts.push(`  목적: ${screen.detail.screenGoal}`);
        }
      }
    }

    if (flowData.edges && flowData.edges.length > 0) {
      parts.push("\n전이 목록:");
      for (const edge of flowData.edges) {
        const fromScreen = flowData.screens.find((s) => s.id === edge.fromScreenId);
        const toScreen = flowData.screens.find((s) => s.id === edge.toScreenId);
        parts.push(
          `- ${fromScreen?.name ?? "?"} → ${toScreen?.name ?? "?"}: ${edge.conditionLabel} (${edge.transitionType})`,
        );
      }
    }

    return parts.join("\n");
  }

  private parseAgentResponse(response: string): FlowAgentResponse {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { reply: response, questions: [], suggestions: [] };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        reply: parsed.reply ?? response,
        questions: (parsed.questions ?? []).map((q: StructuredQuestion) => ({
          ...q,
          id: q.id ?? crypto.randomUUID(),
        })),
        suggestions: (parsed.suggestions ?? []).map((s: AiSuggestion) => ({
          ...s,
          id: s.id ?? crypto.randomUUID(),
          status: "pending" as const,
        })),
      };
    } catch {
      return { reply: response, questions: [], suggestions: [] };
    }
  }

  private async storeSuggestions(sessionId: string, suggestions: AiSuggestion[]) {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
      columns: { id: true, metadata: true },
    });

    const metadata = (session?.metadata as Record<string, unknown>) ?? {};
    const existing = (metadata.pendingSuggestions as AiSuggestion[]) ?? [];
    const updated = [...existing.filter((s) => s.status === "pending"), ...suggestions];

    await this.db
      .update(agentDeskSessions)
      .set({ metadata: { ...metadata, pendingSuggestions: updated } })
      .where(eq(agentDeskSessions.id, sessionId));
  }

  private async updateSuggestionStatus(
    sessionId: string,
    metadata: Record<string, unknown>,
    suggestions: AiSuggestion[],
  ) {
    await this.db
      .update(agentDeskSessions)
      .set({ metadata: { ...metadata, pendingSuggestions: suggestions } })
      .where(eq(agentDeskSessions.id, sessionId));
  }

  private applySuggestionToFlowData(
    flowData: FlowData,
    type: AiSuggestion["type"],
    previewData: Record<string, unknown>,
  ) {
    switch (type) {
      case "add_screen": {
        const newScreen = previewData as unknown as FlowScreen;
        flowData.screens.push({
          ...newScreen,
          order: flowData.screens.length,
          wireframeMermaid: newScreen.wireframeMermaid ?? "",
          nextScreenIds: newScreen.nextScreenIds ?? [],
          metadata: newScreen.metadata ?? {},
        });
        break;
      }
      case "remove_screen": {
        const screenId = previewData.screenId as string;
        flowData.screens = flowData.screens.filter((s) => s.id !== screenId);
        if (flowData.edges) {
          flowData.edges = flowData.edges.filter(
            (e) => e.fromScreenId !== screenId && e.toScreenId !== screenId,
          );
        }
        break;
      }
      case "update_screen": {
        const { screenId: sid, ...updates } = previewData as Record<string, unknown> & {
          screenId: string;
        };
        const screen = flowData.screens.find((s) => s.id === sid);
        if (screen) Object.assign(screen, updates);
        break;
      }
      case "update_detail": {
        const { screenId: detailSid, ...detailUpdates } = previewData as Record<
          string,
          unknown
        > & { screenId: string };
        const detailScreen = flowData.screens.find((s) => s.id === detailSid);
        if (detailScreen) {
          detailScreen.detail = {
            ...detailScreen.detail,
            ...(detailUpdates as Partial<ScreenDetail>),
          };
        }
        break;
      }
      case "add_edge": {
        const newEdge = previewData as unknown as FlowEdge;
        if (!flowData.edges) flowData.edges = [];
        flowData.edges.push(newEdge);
        break;
      }
      case "update_edge": {
        const { edgeId, ...edgeUpdates } = previewData as Record<string, unknown> & {
          edgeId: string;
        };
        const edge = flowData.edges?.find((e) => e.id === edgeId);
        if (edge) Object.assign(edge, edgeUpdates);
        break;
      }
    }
  }
}
