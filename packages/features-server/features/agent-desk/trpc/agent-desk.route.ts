import { authProcedure, createServiceContainer, getAuthUserId, router } from "../../../core/trpc";
import type { LLMService } from "../../../features/ai";
import { z } from "zod";
import { createSessionSchema } from "../dto/create-session.dto";
import {
  exportToCanvasSchema,
  generateDiagramsSchema,
  generateFromAnalysisSchema,
  generateSingleDiagramSchema,
} from "../dto/diagram.dto";
import {
  analyzeSchema,
  cancelExecutionSchema,
  executeSchema,
  generateSpecSchema,
} from "../dto/pipeline.dto";
import {
  addScreenSchema,
  updateScreenSchema,
  removeScreenSchema,
  updateDesignerSettingsSchema,
  updateFlowDataSchema,
  completeFlowDesignSchema,
} from "../dto/flow-designer.dto";
import { addRequirementSourceSchema, listRequirementSourcesSchema } from "../dto/requirement-source.dto";
import { normalizeRequirementsSchema, listNormalizedRequirementsSchema } from "../dto/normalize-requirements.dto";
import { previewLinearIssuesSchema, createLinearIssuesSchema, getLinearPublishStatusSchema } from "../dto/linear-publish.dto";
import {
  generateScreenCandidatesSchema,
  selectCanvasNodeSchema,
  selectCanvasEdgeSchema,
  updateScreenCandidateSchema,
  updateFlowEdgeSchema,
  addFlowEdgeSchema,
  deleteFlowEdgeSchema,
} from "../dto/screen-candidate.dto";
import {
  askFlowAgentSchema,
  applyAiSuggestionSchema,
  generateImplementationHandoffSchema,
  generateFlowSpecDraftSchema,
  resolveUiComponentsSchema,
} from "../dto/flow-agent.dto";
import { sendMessageSchema } from "../dto/send-message.dto";
import { confirmUploadSchema } from "../dto/upload-file.dto";
import type { AnalyzerService } from "../service/analyzer.service";
import type { CanvasExporterService } from "../service/canvas-exporter.service";
import type { ChatService } from "../service/chat.service";
import type { DiagramGeneratorService } from "../service/diagram-generator.service";
import type { ExecutorService } from "../service/executor.service";
import type { FileParserService } from "../service/file-parser.service";
import type { FlowDesignerService } from "../service/flow-designer.service";
import type { LinearPublisherService } from "../service/linear-publisher.service";
import type { RequirementNormalizerService } from "../service/requirement-normalizer.service";
import type { RequirementSourceService } from "../service/requirement-source.service";
import type { FlowAgentService } from "../service/flow-agent.service";
import type { HandoffComposerService } from "../service/handoff-composer.service";
import type { ScreenCandidateService } from "../service/screen-candidate.service";
import type { SessionService } from "../service/session.service";
import type { UiComponentResolverService } from "../service/ui-component-resolver.service";
import type { OutputComposerService } from "../service/output-composer.service";

const services = createServiceContainer<{
  sessionService: SessionService;
  fileParserService: FileParserService;
  chatService: ChatService;
  analyzerService: AnalyzerService;
  executorService: ExecutorService;
  diagramGeneratorService: DiagramGeneratorService;
  canvasExporterService: CanvasExporterService;
  flowDesignerService: FlowDesignerService;
  requirementSourceService: RequirementSourceService;
  requirementNormalizerService: RequirementNormalizerService;
  screenCandidateService: ScreenCandidateService;
  flowAgentService: FlowAgentService;
  handoffComposerService: HandoffComposerService;
  uiComponentResolverService: UiComponentResolverService;
  outputComposerService: OutputComposerService;
  linearPublisherService: LinearPublisherService;
  llmService: LLMService;
}>();

export const injectAgentDeskServices = services.inject;

export const agentDeskRouter = router({
  // ========================================
  // Session
  // ========================================

  /** 세션 생성 */
  createSession: authProcedure.input(createSessionSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { sessionService, chatService } = services.get();
    const session = await sessionService.create(input, userId);
    const welcome = chatService.getWelcomeMessage(input.type);
    await sessionService.addMessage(session.id, "agent", welcome);
    return { session, welcomeMessage: welcome };
  }),

  /** 세션 상세 조회 (파일 + 메시지 포함) */
  getSession: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    return services.get().sessionService.findByIdWithRelations(input.id);
  }),

  /** 내 세션 목록 */
  listSessions: authProcedure
    .input(z.object({ type: z.enum(["customer", "operator", "designer"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = getAuthUserId(ctx);
      return services.get().sessionService.listByUser(userId, input?.type);
    }),

  /** 세션 삭제 */
  deleteSession: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return services.get().sessionService.delete(input.id);
    }),

  /** 세션 상태 변경 */
  updateSessionStatus: authProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum([
          "chatting",
          "uploading",
          "parsing",
          "designing",
          "analyzing",
          "analyzed",
          "reviewed",
          "spec_generated",
          "project_created",
          "executing",
          "executed",
          "failed",
        ]),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().sessionService.updateStatus(input.id, input.status);
    }),

  // ========================================
  // File
  // ========================================

  /** 파일 업로드 확인 (Storage 업로드 후 메타데이터 등록) */
  confirmUpload: authProcedure.input(confirmUploadSchema).mutation(async ({ input }) => {
    return services.get().sessionService.addFile(input);
  }),

  /** 파일 삭제 */
  removeFile: authProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return services.get().sessionService.removeFile(input.fileId);
    }),

  /** 파일 파싱 */
  parseFile: authProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return services.get().fileParserService.parseFile(input.fileId);
    }),

  /** 세션 파일 목록 */
  getFiles: authProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().sessionService.getFiles(input.sessionId);
    }),

  // ========================================
  // Models
  // ========================================

  /** 사용 가능한 LLM 모델 목록 */
  getModels: authProcedure.query(async () => {
    return services.get().llmService.getAvailableModels();
  }),

  // ========================================
  // Chat
  // ========================================

  /** 메시지 전송 (비스트리밍) */
  sendMessage: authProcedure.input(sendMessageSchema).mutation(async ({ input }) => {
    const { sessionService, chatService } = services.get();
    const session = await sessionService.findById(input.sessionId);

    // 기존 대화 이력 조회
    const messages = await sessionService.getMessages(input.sessionId);
    const history = messages.map((m) => ({
      role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    // 파일 컨텍스트 조합
    const files = await sessionService.getFiles(input.sessionId);
    const parsedFiles = files.filter((f) => f.parsedContent);
    const fileContext =
      parsedFiles.length > 0
        ? parsedFiles.map((f) => `--- ${f.originalName} ---\n${f.parsedContent}`).join("\n\n")
        : undefined;

    // 사용자 메시지 저장
    await sessionService.addMessage(input.sessionId, "user", input.content);

    // 피드백 데이터 (dislike 시 프롬프트 컨텍스트 주입)
    const messageFeedbacks = messages.map((m) => ({
      role: m.role,
      content: m.content,
      feedback: m.feedback,
    }));

    // AI 응답 생성
    const reply = await chatService.chat(
      session.type,
      history,
      input.content,
      fileContext,
      input.model,
      messageFeedbacks,
    );

    // AI 응답 저장
    await sessionService.addMessage(input.sessionId, "agent", reply);

    return { role: "agent" as const, content: reply };
  }),

  /** 대화 이력 조회 */
  getMessages: authProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().sessionService.getMessages(input.sessionId);
    }),

  /** 메시지 피드백 (좋아요/싫어요) */
  updateMessageFeedback: authProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
        feedback: z.enum(["like", "dislike"]).nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService } = services.get();

      const message = await sessionService.getMessageWithSession(input.messageId);
      if (message.role !== "agent") {
        throw new Error("Feedback is only allowed on agent messages");
      }

      await sessionService.verifySessionOwnership(message.sessionId, userId);
      return sessionService.updateMessageFeedback(input.messageId, input.feedback);
    }),

  // ========================================
  // Pipeline
  // ========================================

  /** 요구사항 분석 */
  analyze: authProcedure.input(analyzeSchema).mutation(async ({ input }) => {
    const { analyzerService, sessionService } = services.get();
    await sessionService.updateStatus(input.sessionId, "analyzing");
    try {
      return await analyzerService.analyze(input.sessionId, input.model);
    } catch (error) {
      // 실패 시 세션 상태를 "chatting"으로 롤백 (재시도 가능)
      await sessionService.updateStatus(input.sessionId, "chatting").catch(() => {});
      throw error;
    }
  }),

  /** 스펙 생성 */
  generateSpec: authProcedure.input(generateSpecSchema).mutation(async ({ input }) => {
    const { analyzerService, sessionService } = services.get();
    try {
      return await analyzerService.generateSpec(input.sessionId, input.model);
    } catch (error) {
      await sessionService.updateStatus(input.sessionId, "analyzed").catch(() => {});
      throw error;
    }
  }),

  /** 분석 결과 → 화면 목록 자동 생성 */
  generateScreensFromAnalysis: authProcedure
    .input(z.object({ sessionId: z.string().uuid(), model: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, analyzerService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      try {
        return await analyzerService.generateScreensFromAnalysis(input.sessionId, input.model);
      } catch (error) {
        // 실패 시 analyzed 상태로 롤백 (화면 생성 재시도 가능)
        await sessionService.updateStatus(input.sessionId, "analyzed").catch(() => {});
        throw error;
      }
    }),

  /** 실행 시작 */
  execute: authProcedure.input(executeSchema).mutation(async ({ input }) => {
    const { sessionService } = services.get();

    // 스펙이 반드시 존재해야 실행 가능
    const session = await sessionService.findById(input.sessionId);
    if (!session.spec) {
      throw new Error("Spec must be generated before execution");
    }

    // 비동기 실행 시작 (SSE는 REST 엔드포인트에서 처리)
    return { started: true, sessionId: input.sessionId };
  }),

  /** 실행 취소 */
  cancelExecution: authProcedure.input(cancelExecutionSchema).mutation(async ({ input }) => {
    await services.get().executorService.cancel(input.sessionId);
    return { cancelled: true };
  }),

  /** 실행 상태 조회 */
  getExecution: authProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { executorService } = services.get();
      return {
        isRunning: executorService.isRunning(input.sessionId),
        runningCount: executorService.getRunningCount(),
      };
    }),

  /** 최신 실행 기록 조회 */
  getLatestExecution: authProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().sessionService.getLatestExecution(input.sessionId);
    }),

  // ========================================
  // Diagram Generation
  // ========================================

  /** 캐시된 다이어그램 조회 (없으면 null) */
  getDiagrams: authProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, diagramGeneratorService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return diagramGeneratorService.getCachedDiagrams(input.sessionId);
    }),

  /** 다이어그램 자동 생성 (문서 + 대화 기반) */
  generateDiagrams: authProcedure.input(generateDiagramsSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { sessionService, diagramGeneratorService } = services.get();
    await sessionService.verifySessionOwnership(input.sessionId, userId);
    return diagramGeneratorService.generateDiagrams(input.sessionId, input.model);
  }),

  /** 특정 유형의 다이어그램 단건 생성 */
  generateSingleDiagram: authProcedure
    .input(generateSingleDiagramSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, diagramGeneratorService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return diagramGeneratorService.generateSingleDiagram(
        input.sessionId,
        input.diagramType,
        input.model,
      );
    }),

  /** 분석 결과 기반 다이어그램 생성 */
  generateFromAnalysis: authProcedure
    .input(generateFromAnalysisSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, diagramGeneratorService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return diagramGeneratorService.generateFromAnalysis(input.sessionId, input.model);
    }),

  // ========================================
  // Canvas Export
  // ========================================

  /** 다이어그램 → Obsidian Canvas JSON 변환 */
  exportToCanvas: authProcedure.input(exportToCanvasSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { sessionService, diagramGeneratorService, canvasExporterService } = services.get();
    await sessionService.verifySessionOwnership(input.sessionId, userId);
    const diagrams = await diagramGeneratorService.generateDiagrams(input.sessionId, input.model);
    return canvasExporterService.exportToCanvas(diagrams, input.title);
  }),

  /** 분석 결과 → Canvas 변환 */
  exportAnalysisToCanvas: authProcedure
    .input(exportToCanvasSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, diagramGeneratorService, canvasExporterService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      const diagrams = await diagramGeneratorService.generateFromAnalysis(
        input.sessionId,
        input.model,
      );
      return canvasExporterService.exportToCanvas(diagrams, input.title);
    }),

  // ========================================
  // Flow Designer
  // ========================================

  /** 화면 흐름 데이터 조회 */
  getFlowData: authProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, flowDesignerService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return flowDesignerService.getFlowData(input.sessionId);
    }),

  /** 새 화면 추가 */
  addScreen: authProcedure
    .input(addScreenSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, flowDesignerService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return flowDesignerService.addScreen(input.sessionId, input.name, input.afterScreenId);
    }),

  /** 화면 정보 수정 */
  updateScreen: authProcedure
    .input(updateScreenSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, flowDesignerService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      const { sessionId, screenId, ...updates } = input;
      return flowDesignerService.updateScreen(sessionId, screenId, updates);
    }),

  /** 화면 삭제 */
  removeScreen: authProcedure
    .input(removeScreenSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, flowDesignerService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return flowDesignerService.removeScreen(input.sessionId, input.screenId);
    }),

  /** 디자이너 설정 변경 (플랫폼, 테마) */
  updateDesignerSettings: authProcedure
    .input(updateDesignerSettingsSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, flowDesignerService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      const { sessionId, ...settings } = input;
      await flowDesignerService.updateSettings(sessionId, settings);
      return { success: true };
    }),

  /** 화면 흐름 데이터 전체 저장 */
  saveFlowData: authProcedure
    .input(updateFlowDataSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, flowDesignerService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      await flowDesignerService.saveFlowData(input.sessionId, input.flowData);
      return { success: true };
    }),

  /** 화면 흐름 설계 완료 — 화면정의서 초안 생성 */
  completeFlowDesign: authProcedure
    .input(completeFlowDesignSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, flowDesignerService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      const draft = await flowDesignerService.completeDesign(input.sessionId, input.model);
      return { draft };
    }),

  // ========================================
  // Requirement Sources
  // ========================================

  /** 요구사항 소스 추가 */
  addRequirementSource: authProcedure
    .input(addRequirementSourceSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().requirementSourceService.addSource(input, userId);
    }),

  /** 요구사항 소스 목록 조회 */
  listRequirementSources: authProcedure
    .input(listRequirementSourcesSchema)
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().requirementSourceService.listSources(input.sessionId, userId);
    }),

  // ========================================
  // Requirement Normalization
  // ========================================

  /** 요구사항 정규화 (LLM 기반) */
  normalizeRequirements: authProcedure
    .input(normalizeRequirementsSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().requirementNormalizerService.normalize(input, userId);
    }),

  /** 정규화된 요구사항 목록 조회 */
  listNormalizedRequirements: authProcedure
    .input(listNormalizedRequirementsSchema)
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().requirementNormalizerService.listRequirements(input.sessionId, userId);
    }),

  // ========================================
  // Screen Candidates
  // ========================================

  /** 요구사항 기반 화면 후보 자동 생성 */
  generateScreenCandidates: authProcedure
    .input(generateScreenCandidatesSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().screenCandidateService.generateCandidates(input, userId);
    }),

  /** 캔버스 노드(화면) 선택 */
  selectCanvasNode: authProcedure
    .input(selectCanvasNodeSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().screenCandidateService.selectNode(input, userId);
    }),

  /** 캔버스 엣지 선택 */
  selectCanvasEdge: authProcedure
    .input(selectCanvasEdgeSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().screenCandidateService.selectEdge(input, userId);
    }),

  /** 화면 후보 상세 정보 수정 */
  updateScreenCandidate: authProcedure
    .input(updateScreenCandidateSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().screenCandidateService.updateScreenDetail(input, userId);
    }),

  /** 화면 간 엣지(전이) 수정 */
  updateFlowEdge: authProcedure
    .input(updateFlowEdgeSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().screenCandidateService.updateFlowEdge(input, userId);
    }),

  /** 화면 간 엣지(전이) 추가 */
  addFlowEdge: authProcedure
    .input(addFlowEdgeSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().screenCandidateService.addFlowEdge(input, userId);
    }),

  /** 화면 간 엣지(전이) 삭제 */
  deleteFlowEdge: authProcedure
    .input(deleteFlowEdgeSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().screenCandidateService.deleteFlowEdge(input, userId);
    }),

  // ========================================
  // Flow Agent (AI Collaboration)
  // ========================================

  /** AI 에이전트에 질문 — 구조화 질문 + 제안 카드 반환 */
  askFlowAgent: authProcedure.input(askFlowAgentSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { flowAgentService } = services.get();
    return flowAgentService.askFlowAgent(input, userId);
  }),

  /** AI 제안 적용/무시/수정 */
  applyAiSuggestion: authProcedure.input(applyAiSuggestionSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { flowAgentService } = services.get();
    return flowAgentService.applyAiSuggestion(input, userId);
  }),

  // ========================================
  // Implementation Handoff
  // ========================================

  /** 구현 인계 패키지 생성 */
  generateImplementationHandoff: authProcedure
    .input(generateImplementationHandoffSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { handoffComposerService } = services.get();
      return handoffComposerService.generateHandoff(input, userId);
    }),

  // ========================================
  // Output Composer (Spec Draft + Mermaid + QA Mapping)
  // ========================================

  /** 화면정의서 초안 + Mermaid + QA 매핑 생성 */
  generateFlowSpecDraft: authProcedure
    .input(generateFlowSpecDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { outputComposerService } = services.get();
      return outputComposerService.generateFlowSpecDraft(input, userId);
    }),

  // ========================================
  // UI Component Resolver
  // ========================================

  /** UI 컴포넌트 레지스트리 조회 */
  resolveUiComponents: authProcedure.input(resolveUiComponentsSchema).query(async () => {
    const { uiComponentResolverService } = services.get();
    return uiComponentResolverService.resolveComponents(undefined, undefined);
  }),

  // ========================================
  // Linear Publish
  // ========================================

  /** Linear Issue 초안 생성 (Preview) */
  previewLinearIssues: authProcedure
    .input(previewLinearIssuesSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, linearPublisherService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return linearPublisherService.previewLinearIssues(input);
    }),

  /** Linear Issue 생성 (Publish) */
  createLinearIssues: authProcedure
    .input(createLinearIssuesSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, linearPublisherService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return linearPublisherService.createLinearIssues(input);
    }),

  /** Linear Publish 상태 조회 */
  getLinearPublishStatus: authProcedure
    .input(getLinearPublishStatusSchema)
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { sessionService, linearPublisherService } = services.get();
      await sessionService.verifySessionOwnership(input.sessionId, userId);
      return linearPublisherService.getPublishStatus(input);
    }),
});

export type AgentDeskRouter = typeof agentDeskRouter;
