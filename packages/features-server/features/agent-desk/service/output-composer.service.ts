import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions, agentDeskNormalizedRequirements } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import { LLMService } from "../../../features/ai";
import type { z } from "zod";
import type {
  ChatMessage,
  FlowSpecDraftResult,
  SpecDraftArtifact,
  MermaidArtifact,
  QaMappingArtifact,
  QaRequirementMapping,
  ScreenSummary,
  ArtifactBundle,
} from "../types";
import type { FlowData } from "./flow-designer.service";
import type { generateFlowSpecDraftSchema } from "../dto/flow-agent.dto";
import { SessionService } from "./session.service";

type GenerateFlowSpecDraftDto = z.infer<typeof generateFlowSpecDraftSchema>;

const logger = createLogger("agent-desk");

const SPEC_DRAFT_SYSTEM_PROMPT = `당신은 화면정의서 초안을 생성하는 전문가입니다.
화면 흐름 데이터와 요구사항을 분석하여 Markdown 형식의 화면정의서 초안을 작성합니다.

응답은 반드시 다음 JSON 형식으로:
{
  "screenSummaries": [
    {
      "screenId": "uuid",
      "screenName": "화면 이름",
      "wireframeType": "form|list|detail|dashboard|...",
      "routePath": "/path",
      "description": "화면 설명",
      "requirements": ["req-id-1"],
      "keyElements": ["핵심 요소 1", "핵심 요소 2"]
    }
  ],
  "markdownSections": [
    "# 화면정의서 초안\n\n## 1. 개요\n...",
    "## 2. 화면 상세\n..."
  ]
}

규칙:
- screenId는 flowData에서 가져온 실제 UUID를 사용하세요.
- routePath는 화면의 detail.routePath를 우선 사용하되 없으면 kebab-case로 생성하세요.
- markdownSections는 화면 그룹별로 나눠 상세 스펙을 작성하세요.
- requirements에는 해당 화면과 관련된 요구사항 ID를 매핑하세요.
- keyElements는 화면의 핵심 UI 요소를 나열하세요.`;

@Injectable()
export class OutputComposerService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly sessionService: SessionService,
    private readonly llmService: LLMService,
  ) {}

  async generateFlowSpecDraft(
    input: GenerateFlowSpecDraftDto,
    userId: string,
  ): Promise<FlowSpecDraftResult> {
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

    // 1. Spec Draft (LLM)
    const spec = await this.generateSpecDraft(flowData, requirements, input.model);

    // 2. Mermaid (deterministic)
    const diagrams = this.generateMermaidFlowChart(flowData, session.title ?? "화면 흐름");

    // 3. QA Mapping (deterministic)
    const mappings = this.generateQaMapping(flowData, requirements);

    // Store artifacts in session metadata
    const artifacts: ArtifactBundle = { specDraft: spec, mermaid: diagrams, qaMapping: mappings };
    await this.storeArtifacts(input.sessionId, artifacts);

    logger.info("Flow spec draft generated", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.screen_count": spec.screenSummaries.length,
      "agent_desk.mapping_count": mappings.mappings.length,
    });

    return { spec, diagrams, mappings };
  }

  private async generateSpecDraft(
    flowData: FlowData,
    requirements: Array<{ id: string; category: string; summary: string; sourceRequirementIds?: string[] | null }>,
    model?: string,
  ): Promise<SpecDraftArtifact> {
    const flowContext = this.buildFlowContext(flowData);
    const requirementContext = requirements
      .map((r) => `[${r.category}] (ID: ${r.id}) ${r.summary}`)
      .join("\n");

    const chatMessages: ChatMessage[] = [
      { role: "system", content: SPEC_DRAFT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `다음 화면 흐름과 요구사항을 기반으로 화면정의서 초안을 생성해주세요.\n\n## 화면 흐름\n${flowContext}\n\n## 요구사항\n${requirementContext || "(요구사항 없음)"}`,
      },
    ];

    const response = await this.llmService.chatCompletion(chatMessages, {
      jsonMode: true,
      ...(model ? { model } : {}),
    });

    return this.parseSpecDraftResponse(response, flowData);
  }

  private parseSpecDraftResponse(response: string, flowData: FlowData): SpecDraftArtifact {
    const now = new Date().toISOString();
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return this.buildFallbackSpecDraft(flowData, now);
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const screenSummaries: ScreenSummary[] = (parsed.screenSummaries ?? []).map(
        (s: Record<string, unknown>) => ({
          screenId: String(s.screenId ?? ""),
          screenName: String(s.screenName ?? ""),
          wireframeType: String(s.wireframeType ?? "unknown"),
          routePath: String(s.routePath ?? "/"),
          description: String(s.description ?? ""),
          requirements: Array.isArray(s.requirements) ? s.requirements.map(String) : [],
          keyElements: Array.isArray(s.keyElements) ? s.keyElements.map(String) : [],
        }),
      );

      const markdownSections: string[] = Array.isArray(parsed.markdownSections)
        ? parsed.markdownSections.map(String)
        : [];

      return {
        markdown: markdownSections.join("\n\n") || this.buildDefaultMarkdown(screenSummaries),
        screenSummaries,
        generatedAt: now,
      };
    } catch {
      return this.buildFallbackSpecDraft(flowData, now);
    }
  }

  private buildFallbackSpecDraft(flowData: FlowData, generatedAt: string): SpecDraftArtifact {
    const screenSummaries: ScreenSummary[] = flowData.screens.map((s) => ({
      screenId: s.id,
      screenName: s.name,
      wireframeType: s.wireframeType ?? "unknown",
      routePath: s.detail?.routePath ?? `/${s.name.toLowerCase().replace(/\s+/g, "-")}`,
      description: s.description ?? "",
      requirements: s.detail?.sourceRequirementIds ?? [],
      keyElements: s.detail?.keyElements ?? [],
    }));

    return {
      markdown: this.buildDefaultMarkdown(screenSummaries),
      screenSummaries,
      generatedAt,
    };
  }

  private buildDefaultMarkdown(summaries: ScreenSummary[]): string {
    const lines: string[] = ["# 화면정의서 초안", ""];

    for (const s of summaries) {
      lines.push(`## ${s.screenName}`);
      lines.push(`- **경로**: \`${s.routePath}\``);
      lines.push(`- **와이어프레임**: ${s.wireframeType}`);
      lines.push(`- **설명**: ${s.description || "(설명 없음)"}`);
      if (s.keyElements.length > 0) {
        lines.push(`- **핵심 요소**: ${s.keyElements.join(", ")}`);
      }
      if (s.requirements.length > 0) {
        lines.push(`- **관련 요구사항**: ${s.requirements.join(", ")}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  generateMermaidFlowChart(flowData: FlowData, title: string): MermaidArtifact {
    const lines: string[] = [`graph TD`];

    for (const screen of flowData.screens) {
      const label = screen.name.replace(/"/g, "'");
      lines.push(`  ${screen.id}["${label}"]`);
    }

    for (const edge of (flowData.edges ?? [])) {
      const label = edge.conditionLabel?.replace(/"/g, "'") ?? "";
      if (label) {
        lines.push(`  ${edge.fromScreenId} -->|"${label}"| ${edge.toScreenId}`);
      } else {
        lines.push(`  ${edge.fromScreenId} --> ${edge.toScreenId}`);
      }
    }

    return {
      flowChart: lines.join("\n"),
      title,
      generatedAt: new Date().toISOString(),
    };
  }

  generateQaMapping(
    flowData: FlowData,
    requirements: Array<{ id: string; category: string; summary: string }>,
  ): QaMappingArtifact {
    const mappings: QaRequirementMapping[] = requirements.map((req) => {
      const linkedScreenIds: string[] = [];
      const linkedEdgeIds: string[] = [];

      for (const screen of flowData.screens) {
        const srcReqs = screen.detail?.sourceRequirementIds ?? [];
        if (srcReqs.includes(req.id)) {
          linkedScreenIds.push(screen.id);
        }
      }

      for (const edge of (flowData.edges ?? [])) {
        if (edge.sourceRequirementIds?.includes(req.id)) {
          linkedEdgeIds.push(edge.id);
        }
      }

      const coverage: "full" | "partial" | "none" =
        linkedScreenIds.length > 0 ? "full" : linkedEdgeIds.length > 0 ? "partial" : "none";

      return {
        requirementId: req.id,
        requirementSummary: req.summary,
        category: req.category,
        linkedScreenIds,
        linkedEdgeIds,
        coverage,
      };
    });

    const total = mappings.length;
    const full = mappings.filter((m) => m.coverage === "full").length;
    const partial = mappings.filter((m) => m.coverage === "partial").length;
    const none = mappings.filter((m) => m.coverage === "none").length;

    return {
      mappings,
      coverageSummary: { total, full, partial, none },
      generatedAt: new Date().toISOString(),
    };
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

  private async storeArtifacts(sessionId: string, artifacts: ArtifactBundle) {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
      columns: { id: true, metadata: true },
    });

    const metadata = (session?.metadata as Record<string, unknown>) ?? {};
    const existingHandoff = metadata.implementationHandoff as Record<string, unknown> | undefined;

    if (existingHandoff) {
      existingHandoff.artifacts = artifacts;
      await this.db
        .update(agentDeskSessions)
        .set({ metadata: { ...metadata, implementationHandoff: existingHandoff } })
        .where(eq(agentDeskSessions.id, sessionId));
    } else {
      await this.db
        .update(agentDeskSessions)
        .set({ metadata: { ...metadata, artifacts } })
        .where(eq(agentDeskSessions.id, sessionId));
    }
  }
}
