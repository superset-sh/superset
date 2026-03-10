import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { JwtAuthGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { createLogger } from "../../../core/logger";
import { LLMService } from "../../../features/ai";
import { SessionService } from "../service/session.service";
import { FileParserService } from "../service/file-parser.service";
import { ChatService } from "../service/chat.service";
import { AnalyzerService } from "../service/analyzer.service";
import { ExecutorService } from "../service/executor.service";
import { DiagramGeneratorService } from "../service/diagram-generator.service";
import { CanvasExporterService } from "../service/canvas-exporter.service";
import { FlowDesignerService } from "../service/flow-designer.service";
import { RequirementSourceService } from "../service/requirement-source.service";
import { RequirementNormalizerService } from "../service/requirement-normalizer.service";
import { ScreenCandidateService } from "../service/screen-candidate.service";
import { FlowAgentService } from "../service/flow-agent.service";
import { HandoffComposerService } from "../service/handoff-composer.service";
import { UiComponentResolverService } from "../service/ui-component-resolver.service";
import { OutputComposerService } from "../service/output-composer.service";
import { LinearPublisherService } from "../service/linear-publisher.service";
import type { CreateSessionDto } from "../dto/create-session.dto";
import type { ConfirmUploadDto } from "../dto/upload-file.dto";
import type { SendMessageDto } from "../dto/send-message.dto";
import type { AnalyzeDto, GenerateSpecDto, ExecuteDto, CancelExecutionDto } from "../dto/pipeline.dto";
import type {
  GenerateDiagramsDto,
  GenerateSingleDiagramDto,
  GenerateFromAnalysisDto,
  ExportToCanvasDto,
} from "../dto/diagram.dto";
import type { AddRequirementSourceDto } from "../dto/requirement-source.dto";
import type { NormalizeRequirementsDto } from "../dto/normalize-requirements.dto";
import type {
  GenerateScreenCandidatesDto,
  SelectCanvasNodeDto,
  SelectCanvasEdgeDto,
  UpdateScreenCandidateDto,
  UpdateFlowEdgeDto,
} from "../dto/screen-candidate.dto";

const logger = createLogger("agent-desk");

@ApiTags("Agent Desk")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("agent-desk")
export class AgentDeskController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly fileParserService: FileParserService,
    private readonly chatService: ChatService,
    private readonly analyzerService: AnalyzerService,
    private readonly executorService: ExecutorService,
    private readonly diagramGeneratorService: DiagramGeneratorService,
    private readonly canvasExporterService: CanvasExporterService,
    private readonly flowDesignerService: FlowDesignerService,
    private readonly requirementSourceService: RequirementSourceService,
    private readonly requirementNormalizerService: RequirementNormalizerService,
    private readonly screenCandidateService: ScreenCandidateService,
    private readonly flowAgentService: FlowAgentService,
    private readonly handoffComposerService: HandoffComposerService,
    private readonly uiComponentResolverService: UiComponentResolverService,
    private readonly outputComposerService: OutputComposerService,
    private readonly linearPublisherService: LinearPublisherService,
    private readonly llmService: LLMService,
  ) {}

  // ============================================================================
  // Session Endpoints
  // ============================================================================

  /** POST /api/agent-desk/sessions - 세션 생성 */
  @Post("sessions")
  @ApiOperation({ summary: "에이전트 데스크 세션 생성" })
  @ApiResponse({ status: 201, description: "세션 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async createSession(@CurrentUser() user: User, @Body() dto: CreateSessionDto) {
    const session = await this.sessionService.create(dto, user.id);
    const welcome = this.chatService.getWelcomeMessage(dto.type);
    await this.sessionService.addMessage(session.id, "agent", welcome);
    return { session, welcomeMessage: welcome };
  }

  /** GET /api/agent-desk/sessions - 내 세션 목록 */
  @Get("sessions")
  @ApiOperation({ summary: "내 세션 목록 조회" })
  @ApiQuery({ name: "type", required: false, enum: ["customer", "operator", "designer"], description: "세션 유형 필터" })
  @ApiResponse({ status: 200, description: "세션 목록 반환" })
  async listSessions(
    @CurrentUser() user: User,
    @Query("type") type?: "customer" | "operator" | "designer",
  ) {
    return this.sessionService.listByUser(user.id, type);
  }

  /** GET /api/agent-desk/sessions/:id - 세션 상세 */
  @Get("sessions/:id")
  @ApiOperation({ summary: "세션 상세 조회 (파일/메시지 포함)" })
  @ApiParam({ name: "id", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "세션 상세 정보 반환" })
  @ApiResponse({ status: 404, description: "세션을 찾을 수 없음" })
  async getSession(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionService.findByIdWithRelations(id);
  }

  /** DELETE /api/agent-desk/sessions/:id - 세션 삭제 */
  @Delete("sessions/:id")
  @ApiOperation({ summary: "세션 삭제" })
  @ApiParam({ name: "id", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "세션 삭제 성공" })
  @ApiResponse({ status: 404, description: "세션을 찾을 수 없음" })
  async deleteSession(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionService.delete(id);
  }

  // ============================================================================
  // File Endpoints
  // ============================================================================

  /** POST /api/agent-desk/files - 파일 메타데이터 등록 */
  @Post("files")
  @ApiOperation({ summary: "파일 업로드 확인 (메타데이터 등록)" })
  @ApiResponse({ status: 201, description: "파일 등록 성공" })
  async confirmUpload(@Body() dto: ConfirmUploadDto) {
    return this.sessionService.addFile(dto);
  }

  /** DELETE /api/agent-desk/files/:fileId - 파일 삭제 */
  @Delete("files/:fileId")
  @ApiOperation({ summary: "파일 삭제" })
  @ApiParam({ name: "fileId", description: "파일 UUID" })
  @ApiResponse({ status: 200, description: "파일 삭제 성공" })
  async removeFile(@Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.sessionService.removeFile(fileId);
  }

  /** POST /api/agent-desk/files/:fileId/parse - 파일 파싱 */
  @Post("files/:fileId/parse")
  @ApiOperation({ summary: "파일 파싱 (텍스트 추출)" })
  @ApiParam({ name: "fileId", description: "파일 UUID" })
  @ApiResponse({ status: 200, description: "파싱 결과 반환" })
  async parseFile(@Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.fileParserService.parseFile(fileId);
  }

  /** GET /api/agent-desk/sessions/:sessionId/files - 세션 파일 목록 */
  @Get("sessions/:sessionId/files")
  @ApiOperation({ summary: "세션 파일 목록 조회" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "파일 목록 반환" })
  async getFiles(@Param("sessionId", ParseUUIDPipe) sessionId: string) {
    return this.sessionService.getFiles(sessionId);
  }

  // ============================================================================
  // Model Endpoints
  // ============================================================================

  /** GET /api/agent-desk/models - 사용 가능한 LLM 모델 목록 */
  @Get("models")
  @ApiOperation({ summary: "사용 가능한 LLM 모델 목록 조회" })
  @ApiResponse({ status: 200, description: "모델 목록 반환" })
  getModels() {
    return this.llmService.getAvailableModels();
  }

  // ============================================================================
  // Chat Endpoints
  // ============================================================================

  /** POST /api/agent-desk/chat/stream - 스트리밍 메시지 전송 (SSE) */
  @Post("chat/stream")
  @ApiOperation({ summary: "에이전트 스트리밍 대화 (SSE)" })
  @ApiResponse({ status: 200, description: "SSE 스트리밍 응답" })
  async streamChat(@Body() dto: SendMessageDto, @Res() reply: FastifyReply) {
    const origin = (reply.request.headers as Record<string, string>).origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });

    try {
      const session = await this.sessionService.findById(dto.sessionId);
      const messages = await this.sessionService.getMessages(dto.sessionId);
      const history = messages.map((m) => ({
        role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      const files = await this.sessionService.getFiles(dto.sessionId);
      const parsedFiles = files.filter((f) => f.parsedContent);
      const fileContext = parsedFiles.length > 0
        ? parsedFiles.map((f) => `--- ${f.originalName} ---\n${f.parsedContent}`).join("\n\n")
        : undefined;

      await this.sessionService.addMessage(dto.sessionId, "user", dto.content);

      const messageFeedbacks = messages.map((m) => ({
        role: m.role,
        content: m.content,
        feedback: m.feedback,
      }));

      let fullResponse = "";
      for await (const chunk of this.chatService.streamChat(
        session.type,
        history,
        dto.content,
        fileContext,
        dto.model,
        messageFeedbacks,
      )) {
        fullResponse += chunk;
        reply.raw.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
      }

      await this.sessionService.addMessage(dto.sessionId, "agent", fullResponse);
      reply.raw.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);

      logger.info("Chat stream completed", {
        "agent_desk.session_id": dto.sessionId,
        "agent_desk.response_length": fullResponse.length,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Chat stream failed", {
        "agent_desk.session_id": dto.sessionId,
        "error.message": errMsg,
      });
      reply.raw.write(`data: ${JSON.stringify({ type: "error", content: errMsg })}\n\n`);
    }

    reply.raw.end();
  }

  /** POST /api/agent-desk/chat - 메시지 전송 (비스트리밍 fallback) */
  @Post("chat")
  @ApiOperation({ summary: "에이전트에게 메시지 전송" })
  @ApiResponse({ status: 200, description: "에이전트 응답 반환" })
  async sendMessage(@Body() dto: SendMessageDto) {
    const session = await this.sessionService.findById(dto.sessionId);
    const messages = await this.sessionService.getMessages(dto.sessionId);

    const history = messages.map((m) => ({
      role: m.role === "agent" ? "assistant" as const : "user" as const,
      content: m.content,
    }));

    const files = await this.sessionService.getFiles(dto.sessionId);
    const parsedFiles = files.filter((f) => f.parsedContent);
    const fileContext = parsedFiles.length > 0
      ? parsedFiles.map((f) => `--- ${f.originalName} ---\n${f.parsedContent}`).join("\n\n")
      : undefined;

    await this.sessionService.addMessage(dto.sessionId, "user", dto.content);

    const messageFeedbacks = messages.map((m) => ({
      role: m.role,
      content: m.content,
      feedback: m.feedback,
    }));

    const reply = await this.chatService.chat(session.type, history, dto.content, fileContext, dto.model, messageFeedbacks);
    await this.sessionService.addMessage(dto.sessionId, "agent", reply);

    return { role: "agent" as const, content: reply };
  }

  /** GET /api/agent-desk/sessions/:sessionId/messages - 대화 이력 */
  @Get("sessions/:sessionId/messages")
  @ApiOperation({ summary: "대화 이력 조회" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "메시지 목록 반환" })
  async getMessages(@Param("sessionId", ParseUUIDPipe) sessionId: string) {
    return this.sessionService.getMessages(sessionId);
  }

  // ============================================================================
  // Pipeline Endpoints
  // ============================================================================

  /** POST /api/agent-desk/pipeline/analyze - 요구사항 분석 */
  @Post("pipeline/analyze")
  @ApiOperation({ summary: "세션 요구사항 분석 시작" })
  @ApiResponse({ status: 200, description: "분석 결과 반환" })
  async analyze(@Body() dto: AnalyzeDto) {
    await this.sessionService.updateStatus(dto.sessionId, "analyzing");
    return this.analyzerService.analyze(dto.sessionId);
  }

  /** POST /api/agent-desk/pipeline/generate-spec - 스펙 생성 */
  @Post("pipeline/generate-spec")
  @ApiOperation({ summary: "Feature 구현 스펙 생성" })
  @ApiResponse({ status: 200, description: "스펙 생성 결과 반환" })
  @ApiResponse({ status: 400, description: "분석 결과가 없음" })
  async generateSpec(@Body() dto: GenerateSpecDto) {
    return this.analyzerService.generateSpec(dto.sessionId);
  }

  /** POST /api/agent-desk/pipeline/generate-screens - 분석 결과 → 화면 목록 생성 */
  @Post("pipeline/generate-screens")
  @ApiOperation({ summary: "분석 결과에서 화면 목록 자동 생성" })
  @ApiResponse({ status: 200, description: "FlowData 반환 (화면 목록 포함)" })
  @ApiResponse({ status: 400, description: "분석 결과가 없음" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async generateScreensFromAnalysis(
    @CurrentUser() user: User,
    @Body() dto: { sessionId: string; model?: string },
  ) {
    await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
    return this.analyzerService.generateScreensFromAnalysis(dto.sessionId, dto.model);
  }

  /** POST /api/agent-desk/pipeline/analyze/stream - 요구사항 분석 (SSE 스트리밍) */
  @Post("pipeline/analyze/stream")
  @ApiOperation({ summary: "요구사항 분석 (SSE 스트리밍)" })
  @ApiResponse({ status: 200, description: "SSE 스트리밍 분석 결과" })
  async analyzeStream(
    @Body() dto: AnalyzeDto,
    @Res() reply: FastifyReply,
    @CurrentUser() user: User,
  ) {
    const origin = (reply.request.headers as Record<string, string>).origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });

    try {
      await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
      await this.sessionService.updateStatus(dto.sessionId, "analyzing");

      await this.analyzerService.analyzeStream(dto.sessionId, dto.model, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch (error) {
      await this.sessionService.updateStatus(dto.sessionId, "chatting").catch(() => {});
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Pipeline analyze stream failed", {
        "agent_desk.session_id": dto.sessionId,
        "error.message": errMsg,
      });
      reply.raw.write(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`);
    }

    reply.raw.end();
  }

  /** POST /api/agent-desk/pipeline/generate-spec/stream - 스펙 생성 (SSE 스트리밍) */
  @Post("pipeline/generate-spec/stream")
  @ApiOperation({ summary: "Feature 구현 스펙 생성 (SSE 스트리밍)" })
  @ApiResponse({ status: 200, description: "SSE 스트리밍 스펙 생성 결과" })
  @ApiResponse({ status: 400, description: "분석 결과가 없음" })
  async generateSpecStream(
    @Body() dto: GenerateSpecDto,
    @Res() reply: FastifyReply,
    @CurrentUser() user: User,
  ) {
    const origin = (reply.request.headers as Record<string, string>).origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });

    try {
      await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);

      await this.analyzerService.generateSpecStream(dto.sessionId, dto.model, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch (error) {
      await this.sessionService.updateStatus(dto.sessionId, "analyzed").catch(() => {});
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Pipeline generate-spec stream failed", {
        "agent_desk.session_id": dto.sessionId,
        "error.message": errMsg,
      });
      reply.raw.write(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`);
    }

    reply.raw.end();
  }

  /** POST /api/agent-desk/pipeline/generate-screens/stream - 화면 생성 (SSE 스트리밍) */
  @Post("pipeline/generate-screens/stream")
  @ApiOperation({ summary: "분석 결과에서 화면 목록 자동 생성 (SSE 스트리밍)" })
  @ApiResponse({ status: 200, description: "SSE 스트리밍 화면 생성 결과" })
  @ApiResponse({ status: 400, description: "분석 결과가 없음" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async generateScreensStream(
    @Body() dto: AnalyzeDto,
    @Res() reply: FastifyReply,
    @CurrentUser() user: User,
  ) {
    const origin = (reply.request.headers as Record<string, string>).origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });

    try {
      await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);

      await this.analyzerService.generateScreensFromAnalysisStream(dto.sessionId, dto.model, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch (error) {
      await this.sessionService.updateStatus(dto.sessionId, "analyzed").catch(() => {});
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Pipeline generate-screens stream failed", {
        "agent_desk.session_id": dto.sessionId,
        "error.message": errMsg,
      });
      reply.raw.write(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`);
    }

    reply.raw.end();
  }

  /** POST /api/agent-desk/pipeline/execute - 실행 (SSE) */
  @Post("pipeline/execute")
  @ApiOperation({ summary: "Feature 구현 실행 (SSE 스트리밍)" })
  @ApiResponse({ status: 200, description: "SSE 스트리밍 실행 로그" })
  @ApiResponse({ status: 400, description: "스펙이 생성되지 않음" })
  async executeStream(@Body() dto: ExecuteDto, @Res() reply: FastifyReply) {
    const origin = (reply.request.headers as Record<string, string>).origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });

    try {
      const session = await this.sessionService.findById(dto.sessionId);
      if (!session.spec) {
        reply.raw.write(`data: ${JSON.stringify({ type: "error", message: "스펙이 먼저 생성되어야 합니다" })}\n\n`);
        reply.raw.end();
        return;
      }

      await this.executorService.execute(dto.sessionId, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Pipeline execution failed", {
        "agent_desk.session_id": dto.sessionId,
        "error.message": errMsg,
      });
      reply.raw.write(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`);
    }

    reply.raw.end();
  }

  /** POST /api/agent-desk/pipeline/cancel - 실행 취소 */
  @Post("pipeline/cancel")
  @ApiOperation({ summary: "실행 취소" })
  @ApiResponse({ status: 200, description: "취소 성공" })
  async cancelExecution(@Body() dto: CancelExecutionDto) {
    await this.executorService.cancel(dto.sessionId);
    return { cancelled: true };
  }

  /** GET /api/agent-desk/pipeline/status/:sessionId - 실행 상태 조회 */
  @Get("pipeline/status/:sessionId")
  @ApiOperation({ summary: "파이프라인 실행 상태 조회" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "실행 상태 반환" })
  async getPipelineStatus(@Param("sessionId", ParseUUIDPipe) sessionId: string) {
    return {
      isRunning: this.executorService.isRunning(sessionId),
      runningCount: this.executorService.getRunningCount(),
    };
  }

  // ============================================================================
  // Diagram Endpoints
  // ============================================================================

  /** GET /api/agent-desk/diagrams/:sessionId - 캐시된 다이어그램 조회 */
  @Get("diagrams/:sessionId")
  @ApiOperation({ summary: "캐시된 다이어그램 조회 (없으면 null)" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "다이어그램 목록 반환 (또는 null)" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async getDiagrams(
    @CurrentUser() user: User,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    await this.sessionService.verifySessionOwnership(sessionId, user.id);
    return this.diagramGeneratorService.getCachedDiagrams(sessionId);
  }

  /** POST /api/agent-desk/diagrams/generate - 다이어그램 자동 생성 */
  @Post("diagrams/generate")
  @ApiOperation({ summary: "문서 기반 다이어그램 자동 생성 (Mermaid)" })
  @ApiResponse({ status: 200, description: "다이어그램 목록 반환" })
  @ApiResponse({ status: 400, description: "세션에 분석할 콘텐츠가 없음" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async generateDiagrams(@CurrentUser() user: User, @Body() dto: GenerateDiagramsDto) {
    await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
    return this.diagramGeneratorService.generateDiagrams(dto.sessionId, dto.model);
  }

  /** POST /api/agent-desk/diagrams/generate-single - 특정 유형 다이어그램 생성 */
  @Post("diagrams/generate-single")
  @ApiOperation({ summary: "특정 유형의 다이어그램 생성" })
  @ApiResponse({ status: 200, description: "단일 다이어그램 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async generateSingleDiagram(@CurrentUser() user: User, @Body() dto: GenerateSingleDiagramDto) {
    await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
    return this.diagramGeneratorService.generateSingleDiagram(
      dto.sessionId,
      dto.diagramType,
      dto.model,
    );
  }

  /** POST /api/agent-desk/diagrams/from-analysis - 분석 결과 기반 다이어그램 생성 */
  @Post("diagrams/from-analysis")
  @ApiOperation({ summary: "분석 결과 기반 다이어그램 생성" })
  @ApiResponse({ status: 200, description: "다이어그램 목록 반환" })
  @ApiResponse({ status: 400, description: "분석 결과가 없음" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async generateFromAnalysis(@CurrentUser() user: User, @Body() dto: GenerateFromAnalysisDto) {
    await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
    return this.diagramGeneratorService.generateFromAnalysis(dto.sessionId, dto.model);
  }

  // ============================================================================
  // Canvas Export Endpoints
  // ============================================================================

  /** POST /api/agent-desk/canvas/export - 다이어그램 → Obsidian Canvas */
  @Post("canvas/export")
  @ApiOperation({ summary: "다이어그램을 Obsidian Canvas JSON으로 변환" })
  @ApiResponse({ status: 200, description: "Canvas JSON 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async exportToCanvas(@CurrentUser() user: User, @Body() dto: ExportToCanvasDto) {
    await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
    const diagrams = await this.diagramGeneratorService.generateDiagrams(
      dto.sessionId,
      dto.model,
    );
    return this.canvasExporterService.exportToCanvas(diagrams, dto.title);
  }

  /** POST /api/agent-desk/canvas/export-analysis - 분석 결과 → Obsidian Canvas */
  @Post("canvas/export-analysis")
  @ApiOperation({ summary: "분석 결과를 Obsidian Canvas JSON으로 변환" })
  @ApiResponse({ status: 200, description: "Canvas JSON 반환" })
  @ApiResponse({ status: 400, description: "분석 결과가 없음" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async exportAnalysisToCanvas(@CurrentUser() user: User, @Body() dto: ExportToCanvasDto) {
    await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
    const diagrams = await this.diagramGeneratorService.generateFromAnalysis(
      dto.sessionId,
      dto.model,
    );
    return this.canvasExporterService.exportToCanvas(diagrams, dto.title);
  }

  // ============================================================================
  // Flow Designer Endpoints
  // ============================================================================

  /** GET /api/agent-desk/flow/:sessionId - 화면 흐름 데이터 조회 */
  @Get("flow/:sessionId")
  @ApiOperation({ summary: "화면 흐름 데이터 조회" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "FlowData 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 404, description: "세션을 찾을 수 없음" })
  @ApiResponse({ status: 400, description: "디자이너 세션이 아님" })
  async getFlowData(
    @CurrentUser() user: User,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    await this.sessionService.verifySessionOwnership(sessionId, user.id);
    return this.flowDesignerService.getFlowData(sessionId);
  }

  /** POST /api/agent-desk/flow/:sessionId/screens - 새 화면 추가 */
  @Post("flow/:sessionId/screens")
  @ApiOperation({ summary: "새 화면 추가" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiResponse({ status: 201, description: "화면 추가 성공" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  async addScreen(
    @CurrentUser() user: User,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: { name: string; afterScreenId?: string },
  ) {
    await this.sessionService.verifySessionOwnership(sessionId, user.id);
    return this.flowDesignerService.addScreen(sessionId, dto.name, dto.afterScreenId);
  }

  /** PATCH /api/agent-desk/flow/:sessionId/screens/:screenId - 화면 정보 수정 */
  @Patch("flow/:sessionId/screens/:screenId")
  @ApiOperation({ summary: "화면 정보 수정" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiParam({ name: "screenId", description: "화면 UUID" })
  @ApiResponse({ status: 200, description: "화면 수정 성공" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 404, description: "화면을 찾을 수 없음" })
  async updateScreen(
    @CurrentUser() user: User,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Param("screenId", ParseUUIDPipe) screenId: string,
    @Body() dto: { name?: string; description?: string; wireframeType?: string; wireframeMermaid?: string; nextScreenIds?: string[]; metadata?: Record<string, unknown> },
  ) {
    await this.sessionService.verifySessionOwnership(sessionId, user.id);
    return this.flowDesignerService.updateScreen(sessionId, screenId, dto);
  }

  /** DELETE /api/agent-desk/flow/:sessionId/screens/:screenId - 화면 삭제 */
  @Delete("flow/:sessionId/screens/:screenId")
  @ApiOperation({ summary: "화면 삭제" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiParam({ name: "screenId", description: "화면 UUID" })
  @ApiResponse({ status: 200, description: "화면 삭제 성공" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 404, description: "화면을 찾을 수 없음" })
  async removeScreen(
    @CurrentUser() user: User,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Param("screenId", ParseUUIDPipe) screenId: string,
  ) {
    await this.sessionService.verifySessionOwnership(sessionId, user.id);
    return this.flowDesignerService.removeScreen(sessionId, screenId);
  }

  /** PATCH /api/agent-desk/flow/:sessionId/settings - 디자이너 설정 변경 */
  @Patch("flow/:sessionId/settings")
  @ApiOperation({ summary: "디자이너 설정 변경 (플랫폼, 테마)" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "설정 변경 성공" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 404, description: "세션을 찾을 수 없음" })
  async updateDesignerSettings(
    @CurrentUser() user: User,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: { platform?: "mobile" | "desktop"; designTheme?: string },
  ) {
    await this.sessionService.verifySessionOwnership(sessionId, user.id);
    await this.flowDesignerService.updateSettings(sessionId, dto);
    return { success: true };
  }

  /** POST /api/agent-desk/flow/:sessionId/complete - 화면 흐름 설계 완료 */
  @Post("flow/:sessionId/complete")
  @ApiOperation({ summary: "화면 흐름 설계 완료 — 화면정의서 생성" })
  @ApiParam({ name: "sessionId", description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "화면정의서 초안 생성 성공" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 404, description: "세션을 찾을 수 없음" })
  async completeFlowDesign(
    @CurrentUser() user: User,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: { model?: string },
  ) {
    await this.sessionService.verifySessionOwnership(sessionId, user.id);
    const draft = await this.flowDesignerService.completeDesign(sessionId, dto.model);
    return { draft };
  }

  // ============================================================================
  // Requirement Source Endpoints
  // ============================================================================

  /** POST /api/agent-desk/sources - 요구사항 소스 추가 */
  @Post("sources")
  @ApiOperation({ summary: "요구사항 소스 추가 (파일 또는 수동 입력)" })
  @ApiResponse({ status: 201, description: "소스 추가 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청 (manual에 rawContent 없음 등)" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async addRequirementSource(@CurrentUser() user: User, @Body() dto: AddRequirementSourceDto) {
    return this.requirementSourceService.addSource(dto, user.id);
  }

  /** GET /api/agent-desk/sources - 요구사항 소스 목록 조회 */
  @Get("sources")
  @ApiOperation({ summary: "요구사항 소스 목록 조회" })
  @ApiQuery({ name: "sessionId", required: true, description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "소스 목록 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async listRequirementSources(
    @CurrentUser() user: User,
    @Query("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    return this.requirementSourceService.listSources(sessionId, user.id);
  }

  // ============================================================================
  // Requirement Normalization Endpoints
  // ============================================================================

  /** POST /api/agent-desk/requirements/normalize - 요구사항 정규화 */
  @Post("requirements/normalize")
  @ApiOperation({ summary: "요구사항 정규화 (LLM 기반 추출 및 분류)" })
  @ApiResponse({ status: 200, description: "정규화 결과 반환" })
  @ApiResponse({ status: 400, description: "파싱된 소스가 없거나 LLM 응답 파싱 실패" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async normalizeRequirements(@CurrentUser() user: User, @Body() dto: NormalizeRequirementsDto) {
    return this.requirementNormalizerService.normalize(dto, user.id);
  }

  /** GET /api/agent-desk/requirements - 정규화된 요구사항 목록 조회 */
  @Get("requirements")
  @ApiOperation({ summary: "정규화된 요구사항 목록 조회" })
  @ApiQuery({ name: "sessionId", required: true, description: "세션 UUID" })
  @ApiResponse({ status: 200, description: "정규화된 요구사항 목록 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async listNormalizedRequirements(
    @CurrentUser() user: User,
    @Query("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    return this.requirementNormalizerService.listRequirements(sessionId, user.id);
  }

  // ============================================================================
  // Screen Candidate Endpoints
  // ============================================================================

  /** POST /api/agent-desk/screens/generate - 요구사항 기반 화면 후보 자동 생성 */
  @Post("screens/generate")
  @ApiOperation({ summary: "요구사항 기반 화면 후보 자동 생성 (LLM)" })
  @ApiResponse({ status: 200, description: "화면 후보 + 엣지 목록 반환" })
  @ApiResponse({ status: 400, description: "정규화된 요구사항이 없음" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async generateScreenCandidates(
    @CurrentUser() user: User,
    @Body() dto: GenerateScreenCandidatesDto,
  ) {
    return this.screenCandidateService.generateCandidates(dto, user.id);
  }

  /** POST /api/agent-desk/canvas/select-node - 캔버스 노드(화면) 선택 */
  @Post("canvas/select-node")
  @ApiOperation({ summary: "캔버스 노드(화면) 선택" })
  @ApiResponse({ status: 200, description: "PanelState 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async selectCanvasNode(
    @CurrentUser() user: User,
    @Body() dto: SelectCanvasNodeDto,
  ) {
    return this.screenCandidateService.selectNode(dto, user.id);
  }

  /** POST /api/agent-desk/canvas/select-edge - 캔버스 엣지 선택 */
  @Post("canvas/select-edge")
  @ApiOperation({ summary: "캔버스 엣지 선택" })
  @ApiResponse({ status: 200, description: "PanelState 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async selectCanvasEdge(
    @CurrentUser() user: User,
    @Body() dto: SelectCanvasEdgeDto,
  ) {
    return this.screenCandidateService.selectEdge(dto, user.id);
  }

  /** PATCH /api/agent-desk/screens/:screenId - 화면 후보 상세 정보 수정 */
  @Patch("screens/:screenId")
  @ApiOperation({ summary: "화면 후보 상세 정보 수정" })
  @ApiParam({ name: "screenId", description: "화면 UUID" })
  @ApiResponse({ status: 200, description: "수정된 FlowData 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 404, description: "화면을 찾을 수 없음" })
  async updateScreenCandidate(
    @CurrentUser() user: User,
    @Param("screenId", ParseUUIDPipe) screenId: string,
    @Body() dto: UpdateScreenCandidateDto,
  ) {
    return this.screenCandidateService.updateScreenDetail(
      { ...dto, screenId },
      user.id,
    );
  }

  /** PATCH /api/agent-desk/edges/:edgeId - 화면 간 엣지(전이) 수정 */
  @Patch("edges/:edgeId")
  @ApiOperation({ summary: "화면 간 엣지(전이) 수정" })
  @ApiParam({ name: "edgeId", description: "엣지 UUID" })
  @ApiResponse({ status: 200, description: "수정된 FlowData 반환" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 404, description: "엣지를 찾을 수 없음" })
  async updateFlowEdge(
    @CurrentUser() user: User,
    @Param("edgeId", ParseUUIDPipe) edgeId: string,
    @Body() dto: UpdateFlowEdgeDto,
  ) {
    return this.screenCandidateService.updateFlowEdge(
      { ...dto, edgeId },
      user.id,
    );
  }

  // ============================================================================
  // Flow Agent (AI Collaboration)
  // ============================================================================

  /** POST /api/agent-desk/agent/ask - AI 에이전트에 질문 */
  @Post("agent/ask")
  @ApiOperation({ summary: "AI 에이전트에 질문 — 구조화 질문 + 제안 카드 반환" })
  @ApiResponse({ status: 200, description: "AI 응답 (reply + questions + suggestions)" })
  async askFlowAgent(
    @Body() body: { sessionId: string; message: string; contextSelection?: { screenIds?: string[]; edgeIds?: string[] }; model?: string },
    @CurrentUser() user: User,
  ) {
    return this.flowAgentService.askFlowAgent(body, user.id);
  }

  /** POST /api/agent-desk/suggestions/:id/apply - AI 제안 적용/무시/수정 */
  @Post("suggestions/:id/apply")
  @ApiOperation({ summary: "AI 제안 적용/무시/수정" })
  @ApiParam({ name: "id", description: "제안 ID" })
  @ApiResponse({ status: 200, description: "제안 적용 결과" })
  async applyAiSuggestion(
    @Param("id") suggestionId: string,
    @Body() body: { sessionId: string; action: "apply" | "ignore" | "modify"; modifications?: Record<string, unknown> },
    @CurrentUser() user: User,
  ) {
    return this.flowAgentService.applyAiSuggestion(
      { sessionId: body.sessionId, suggestionId, action: body.action, modifiedData: body.modifications },
      user.id,
    );
  }

  // ============================================================================
  // Implementation Handoff
  // ============================================================================

  /** POST /api/agent-desk/spec/implementation-handoff - 구현 인계 패키지 생성 */
  @Post("spec/implementation-handoff")
  @ApiOperation({ summary: "구현 인계 패키지 생성" })
  @ApiResponse({ status: 200, description: "Implementation handoff 패키지" })
  async generateImplementationHandoff(
    @Body() body: { sessionId: string; includeRoutes?: boolean; includeQa?: boolean; includeUiSpecs?: boolean; resolveUiComponents?: boolean; model?: string },
    @CurrentUser() user: User,
  ) {
    return this.handoffComposerService.generateHandoff(body, user.id);
  }

  // ============================================================================
  // Output Composer (Spec Draft + Mermaid + QA Mapping)
  // ============================================================================

  /** POST /api/agent-desk/spec/flow-draft - 화면정의서 초안 + Mermaid + QA 매핑 생성 */
  @Post("spec/flow-draft")
  @ApiOperation({ summary: "화면정의서 초안 + Mermaid 다이어그램 + QA 매핑 생성" })
  @ApiResponse({ status: 200, description: "{ spec, diagrams, mappings }" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  @ApiResponse({ status: 404, description: "세션 또는 화면 데이터 없음" })
  async generateFlowSpecDraft(
    @Body() body: { sessionId: string; model?: string },
    @CurrentUser() user: User,
  ) {
    return this.outputComposerService.generateFlowSpecDraft(body, user.id);
  }

  // ============================================================================
  // UI Component Resolver
  // ============================================================================

  /** GET /api/agent-desk/ui/components - UI 컴포넌트 레지스트리 조회 */
  @Get("ui/components")
  @ApiOperation({ summary: "UI 컴포넌트 레지스트리 조회" })
  @ApiQuery({ name: "hints", required: false, description: "컴포넌트 힌트 (쉼표 구분)" })
  @ApiQuery({ name: "category", required: false, description: "카테고리 필터" })
  @ApiResponse({ status: 200, description: "UI 컴포넌트 목록" })
  async resolveUiComponents(
    @Query("hints") hints?: string,
    @Query("category") category?: string,
  ) {
    const componentHints = hints ? hints.split(",").map((h) => h.trim()) : undefined;
    return this.uiComponentResolverService.resolveComponents(componentHints, category);
  }

  // ============================================================================
  // Linear Publish Endpoints
  // ============================================================================

  /** POST /api/agent-desk/linear/preview - Linear Issue 초안 생성 */
  @Post("linear/preview")
  @ApiOperation({ summary: "Linear Issue 초안 생성 (Preview/Draft)" })
  @ApiResponse({ status: 200, description: "Issue 초안 목록 반환" })
  @ApiResponse({ status: 400, description: "handoff 데이터 없음 또는 잘못된 요청" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async previewLinearIssues(
    @CurrentUser() user: User,
    @Body() dto: {
      sessionId: string;
      handoffVersion: number;
      teamKey: string;
      projectId?: string;
      storyIds: string[];
      groupingMode: string;
      includeSubIssues: boolean;
      templatePath?: string;
    },
  ) {
    await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
    return this.linearPublisherService.previewLinearIssues(dto);
  }

  /** POST /api/agent-desk/linear/issues - Linear Issue 생성 */
  @Post("linear/issues")
  @ApiOperation({ summary: "Linear Issue 생성 (Publish)" })
  @ApiResponse({ status: 200, description: "생성된 Issue 목록 반환" })
  @ApiResponse({ status: 404, description: "Publish job을 찾을 수 없음" })
  @ApiResponse({ status: 409, description: "draftKey 불일치" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async createLinearIssues(
    @CurrentUser() user: User,
    @Body() dto: {
      sessionId: string;
      publishJobId: string;
      draftKey: string;
      assigneeId?: string;
      createSubIssues: boolean;
    },
  ) {
    await this.sessionService.verifySessionOwnership(dto.sessionId, user.id);
    return this.linearPublisherService.createLinearIssues(dto);
  }

  /** GET /api/agent-desk/linear/publish-status - Linear Publish 상태 조회 */
  @Get("linear/publish-status")
  @ApiOperation({ summary: "Linear Publish Job 상태 조회" })
  @ApiQuery({ name: "sessionId", required: true, description: "세션 UUID" })
  @ApiQuery({ name: "publishJobId", required: true, description: "Publish Job UUID" })
  @ApiResponse({ status: 200, description: "Publish 상태 반환" })
  @ApiResponse({ status: 404, description: "Publish job을 찾을 수 없음" })
  @ApiResponse({ status: 403, description: "세션 접근 권한 없음" })
  async getLinearPublishStatus(
    @CurrentUser() user: User,
    @Query("sessionId", ParseUUIDPipe) sessionId: string,
    @Query("publishJobId", ParseUUIDPipe) publishJobId: string,
  ) {
    await this.sessionService.verifySessionOwnership(sessionId, user.id);
    return this.linearPublisherService.getPublishStatus({ sessionId, publishJobId });
  }
}
