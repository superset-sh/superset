/**
 * Content Studio REST Controller
 *
 * 스튜디오, 토픽, 콘텐츠, 엣지, SEO, 캘린더, 반복, AI, 브랜드보이스, 리퍼포즈 엔드포인트
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard, NestAdminGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { ContentStudioService } from "../service/content-studio.service";
import { StudioAiSuggestService } from "../service/studio-ai-suggest.service";
import { StudioBrandVoiceService } from "../service/studio-brand-voice.service";
import { StudioSeoService } from "../service/studio-seo.service";
import { StudioRepurposeService } from "../service/studio-repurpose.service";

@ApiTags("Content Studio")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("content-studio")
export class ContentStudioController {
  constructor(
    private readonly studioService: ContentStudioService,
    private readonly aiSuggestService: StudioAiSuggestService,
    private readonly brandVoiceService: StudioBrandVoiceService,
    private readonly seoService: StudioSeoService,
    private readonly repurposeService: StudioRepurposeService,
  ) {}

  // ==========================================================================
  // Studio
  // ==========================================================================

  @Get("studios")
  @ApiOperation({ summary: "내 스튜디오 목록 조회" })
  @ApiResponse({ status: 200, description: "스튜디오 목록 반환" })
  async listStudios(@CurrentUser() user: User) {
    return this.studioService.findStudios(user.id);
  }

  @Get("studios/:id/canvas")
  @ApiOperation({ summary: "캔버스 데이터 조회" })
  @ApiParam({ name: "id", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "캔버스 데이터 반환" })
  async getCanvas(
    @Param("id", ParseUUIDPipe) studioId: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.getCanvasData(studioId, user.id);
  }

  @Post("studios")
  @ApiOperation({ summary: "스튜디오 생성" })
  @ApiResponse({ status: 201, description: "스튜디오 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['title'], properties: { title: { type: 'string', description: '스튜디오 제목' }, description: { type: 'string', description: '스튜디오 설명' }, visibility: { type: 'string', enum: ['public', 'private'], description: '공개 여부' } } } })
  async createStudio(
    @Body() dto: { title: string; description?: string; visibility?: "public" | "private" },
    @CurrentUser() user: User,
  ) {
    return this.studioService.createStudio(dto, user.id);
  }

  @Put("studios/:id")
  @ApiOperation({ summary: "스튜디오 수정" })
  @ApiParam({ name: "id", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "스튜디오 수정 성공" })
  @ApiBody({ schema: { type: 'object', properties: { title: { type: 'string', description: '스튜디오 제목' }, description: { type: 'string', nullable: true, description: '스튜디오 설명' }, visibility: { type: 'string', enum: ['public', 'private'], description: '공개 여부' } } } })
  async updateStudio(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { title?: string; description?: string | null; visibility?: "public" | "private" },
    @CurrentUser() user: User,
  ) {
    return this.studioService.updateStudio(id, dto, user.id);
  }

  @Delete("studios/:id")
  @ApiOperation({ summary: "스튜디오 삭제" })
  @ApiParam({ name: "id", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "스튜디오 삭제 성공" })
  async deleteStudio(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.deleteStudio(id, user.id);
  }

  // ==========================================================================
  // Topic
  // ==========================================================================

  @Post("topics")
  @ApiOperation({ summary: "토픽 생성" })
  @ApiResponse({ status: 201, description: "토픽 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'label'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, label: { type: 'string', description: '토픽 라벨' }, color: { type: 'string', description: '토픽 색상' }, positionX: { type: 'number', description: 'X 좌표' }, positionY: { type: 'number', description: 'Y 좌표' } } } })
  async createTopic(
    @Body() dto: { studioId: string; label: string; color?: string; positionX?: number; positionY?: number },
    @CurrentUser() user: User,
  ) {
    return this.studioService.createTopic(dto, user.id);
  }

  @Put("topics/:id")
  @ApiOperation({ summary: "토픽 수정" })
  @ApiParam({ name: "id", description: "토픽 ID" })
  @ApiResponse({ status: 200, description: "토픽 수정 성공" })
  @ApiBody({ schema: { type: 'object', properties: { label: { type: 'string', description: '토픽 라벨' }, color: { type: 'string', nullable: true, description: '토픽 색상' }, positionX: { type: 'number', description: 'X 좌표' }, positionY: { type: 'number', description: 'Y 좌표' } } } })
  async updateTopic(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { label?: string; color?: string | null; positionX?: number; positionY?: number },
    @CurrentUser() user: User,
  ) {
    return this.studioService.updateTopic(id, dto, user.id);
  }

  @Delete("topics/:id")
  @ApiOperation({ summary: "토픽 삭제" })
  @ApiParam({ name: "id", description: "토픽 ID" })
  @ApiResponse({ status: 200, description: "토픽 삭제 성공" })
  async deleteTopic(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.deleteTopic(id, user.id);
  }

  // ==========================================================================
  // Content
  // ==========================================================================

  @Get("contents/:id")
  @ApiOperation({ summary: "콘텐츠 상세 조회" })
  @ApiParam({ name: "id", description: "콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "콘텐츠 상세 정보" })
  async getContent(@Param("id", ParseUUIDPipe) id: string) {
    return this.studioService.getContent(id);
  }

  @Post("contents")
  @ApiOperation({ summary: "콘텐츠 생성" })
  @ApiResponse({ status: 201, description: "콘텐츠 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'title'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, topicId: { type: 'string', format: 'uuid', description: '토픽 ID' }, title: { type: 'string', description: '콘텐츠 제목' }, content: { type: 'string', description: '콘텐츠 본문' }, positionX: { type: 'number', description: 'X 좌표' }, positionY: { type: 'number', description: 'Y 좌표' } } } })
  async createContent(
    @Body() dto: { studioId: string; topicId?: string; title: string; content?: string; positionX?: number; positionY?: number },
    @CurrentUser() user: User,
  ) {
    return this.studioService.createContent(dto, user.id);
  }

  @Put("contents/:id")
  @ApiOperation({ summary: "콘텐츠 수정" })
  @ApiParam({ name: "id", description: "콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "콘텐츠 수정 성공" })
  @ApiBody({ schema: { type: 'object', description: '콘텐츠 수정 필드', properties: { title: { type: 'string', description: '제목' }, content: { type: 'string', description: '본문' }, topicId: { type: 'string', format: 'uuid', description: '토픽 ID' }, status: { type: 'string', description: '상태' }, scheduledAt: { type: 'string', format: 'date-time', nullable: true, description: '예약 시간' } } } })
  async updateContent(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: User,
  ) {
    const data = {
      ...dto,
      scheduledAt: dto.scheduledAt === null ? null : dto.scheduledAt ? new Date(dto.scheduledAt as string) : undefined,
    };
    return this.studioService.updateContent(id, data, user.id);
  }

  @Delete("contents/:id")
  @ApiOperation({ summary: "콘텐츠 삭제" })
  @ApiParam({ name: "id", description: "콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "콘텐츠 삭제 성공" })
  async deleteContent(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.deleteContent(id, user.id);
  }

  @Put("nodes/positions")
  @ApiOperation({ summary: "노드 위치 일괄 업데이트" })
  @ApiResponse({ status: 200, description: "위치 업데이트 성공" })
  @ApiBody({ schema: { type: 'object', required: ['updates'], properties: { updates: { type: 'array', items: { type: 'object', required: ['id', 'type', 'positionX', 'positionY'], properties: { id: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['topic', 'content'] }, positionX: { type: 'number' }, positionY: { type: 'number' } } }, description: '노드 위치 업데이트 배열' } } } })
  async updateNodePositions(
    @Body() dto: { updates: Array<{ id: string; type: "topic" | "content"; positionX: number; positionY: number }> },
    @CurrentUser() user: User,
  ) {
    return this.studioService.updateNodePositions(dto.updates, user.id);
  }

  // ==========================================================================
  // Edge
  // ==========================================================================

  @Post("edges")
  @ApiOperation({ summary: "엣지 생성" })
  @ApiResponse({ status: 201, description: "엣지 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'sourceId', 'sourceType', 'targetId', 'targetType'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, sourceId: { type: 'string', format: 'uuid', description: '소스 노드 ID' }, sourceType: { type: 'string', enum: ['topic', 'content'], description: '소스 노드 유형' }, targetId: { type: 'string', format: 'uuid', description: '타겟 노드 ID' }, targetType: { type: 'string', enum: ['topic', 'content'], description: '타겟 노드 유형' } } } })
  async createEdge(
    @Body() dto: { studioId: string; sourceId: string; sourceType: "topic" | "content"; targetId: string; targetType: "topic" | "content" },
    @CurrentUser() user: User,
  ) {
    return this.studioService.createEdge(dto, user.id);
  }

  @Delete("edges/:id")
  @ApiOperation({ summary: "엣지 삭제" })
  @ApiParam({ name: "id", description: "엣지 ID" })
  @ApiResponse({ status: 200, description: "엣지 삭제 성공" })
  async deleteEdge(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.deleteEdge(id, user.id);
  }

  // ==========================================================================
  // SEO
  // ==========================================================================

  @Get("seo/:contentId/history")
  @ApiOperation({ summary: "SEO 이력 조회" })
  @ApiParam({ name: "contentId", description: "콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "SEO 이력 반환" })
  async seoHistory(@Param("contentId", ParseUUIDPipe) contentId: string) {
    return this.studioService.getSeoHistory(contentId);
  }

  @Post("seo/:contentId/snapshot")
  @ApiOperation({ summary: "SEO 스냅샷 추가" })
  @ApiParam({ name: "contentId", description: "콘텐츠 ID" })
  @ApiResponse({ status: 201, description: "SEO 스냅샷 추가 성공" })
  @ApiBody({ schema: { type: 'object', description: 'SEO 스냅샷 데이터', properties: { focusKeyword: { type: 'string', description: '포커스 키워드' }, score: { type: 'number', description: 'SEO 점수' }, metaTitle: { type: 'string', description: '메타 타이틀' }, metaDescription: { type: 'string', description: '메타 설명' } } } })
  async addSeoSnapshot(
    @Param("contentId", ParseUUIDPipe) contentId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: User,
  ) {
    return this.studioService.addSeoSnapshot(contentId, dto, user.id);
  }

  // ==========================================================================
  // Calendar
  // ==========================================================================

  @Get("calendar/:studioId")
  @ApiOperation({ summary: "캘린더 콘텐츠 조회" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiQuery({ name: "year", required: true, type: Number })
  @ApiQuery({ name: "month", required: true, type: Number })
  @ApiResponse({ status: 200, description: "캘린더 콘텐츠 반환" })
  async calendarList(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @Query("year", ParseIntPipe) year: number,
    @Query("month", ParseIntPipe) month: number,
    @CurrentUser() user: User,
  ) {
    return this.studioService.getCalendarContents(studioId, year, month, user.id);
  }

  @Post("calendar/schedule")
  @ApiOperation({ summary: "콘텐츠 예약" })
  @ApiResponse({ status: 200, description: "콘텐츠 예약 성공" })
  @ApiBody({ schema: { type: 'object', required: ['contentId', 'scheduledAt'], properties: { contentId: { type: 'string', format: 'uuid', description: '콘텐츠 ID' }, scheduledAt: { type: 'string', format: 'date-time', description: '예약 시간' } } } })
  async scheduleContent(
    @Body() dto: { contentId: string; scheduledAt: string },
    @CurrentUser() user: User,
  ) {
    return this.studioService.scheduleContent(dto.contentId, new Date(dto.scheduledAt), user.id);
  }

  @Post("calendar/unschedule")
  @ApiOperation({ summary: "콘텐츠 예약 해제" })
  @ApiResponse({ status: 200, description: "콘텐츠 예약 해제 성공" })
  @ApiBody({ schema: { type: 'object', required: ['contentId'], properties: { contentId: { type: 'string', format: 'uuid', description: '콘텐츠 ID' } } } })
  async unscheduleContent(
    @Body() dto: { contentId: string },
    @CurrentUser() user: User,
  ) {
    return this.studioService.unscheduleContent(dto.contentId, user.id);
  }

  // ==========================================================================
  // Recurrence
  // ==========================================================================

  @Get("recurrences/:studioId")
  @ApiOperation({ summary: "반복 규칙 목록 조회" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "반복 규칙 목록 반환" })
  async listRecurrences(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.findRecurrences(studioId, user.id);
  }

  @Post("recurrences")
  @ApiOperation({ summary: "반복 규칙 생성" })
  @ApiResponse({ status: 201, description: "반복 규칙 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'title', 'rule'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, title: { type: 'string', description: '반복 규칙 이름' }, rule: { type: 'string', description: '반복 규칙 (cron 등)' }, templateContentId: { type: 'string', format: 'uuid', description: '템플릿 콘텐츠 ID' }, label: { type: 'string', description: '라벨' }, nextRunAt: { type: 'string', format: 'date-time', description: '다음 실행 시간' } } } })
  async createRecurrence(
    @Body() dto: { studioId: string; title: string; rule: string; templateContentId?: string; label?: string; nextRunAt?: string },
    @CurrentUser() user: User,
  ) {
    const data = {
      ...dto,
      nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
    };
    return this.studioService.createRecurrence(data, user.id);
  }

  @Put("recurrences/:id")
  @ApiOperation({ summary: "반복 규칙 수정" })
  @ApiParam({ name: "id", description: "반복 규칙 ID" })
  @ApiResponse({ status: 200, description: "반복 규칙 수정 성공" })
  @ApiBody({ schema: { type: 'object', properties: { title: { type: 'string', description: '반복 규칙 이름' }, rule: { type: 'string', description: '반복 규칙' }, templateContentId: { type: 'string', format: 'uuid', nullable: true, description: '템플릿 콘텐츠 ID' }, label: { type: 'string', nullable: true, description: '라벨' }, nextRunAt: { type: 'string', format: 'date-time', nullable: true, description: '다음 실행 시간' } } } })
  async updateRecurrence(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { title?: string; rule?: string; templateContentId?: string | null; label?: string | null; nextRunAt?: string | null },
    @CurrentUser() user: User,
  ) {
    const data = {
      ...dto,
      nextRunAt: dto.nextRunAt === null ? null : dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
    };
    return this.studioService.updateRecurrence(id, data, user.id);
  }

  @Delete("recurrences/:id")
  @ApiOperation({ summary: "반복 규칙 삭제" })
  @ApiParam({ name: "id", description: "반복 규칙 ID" })
  @ApiResponse({ status: 200, description: "반복 규칙 삭제 성공" })
  async deleteRecurrence(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.deleteRecurrence(id, user.id);
  }

  @Post("recurrences/:id/toggle")
  @ApiOperation({ summary: "반복 규칙 활성/비활성 토글" })
  @ApiParam({ name: "id", description: "반복 규칙 ID" })
  @ApiResponse({ status: 200, description: "반복 규칙 토글 완료" })
  async toggleRecurrence(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.toggleRecurrence(id, user.id);
  }

  @Post("recurrences/:id/execute")
  @ApiOperation({ summary: "반복 규칙 즉시 실행" })
  @ApiParam({ name: "id", description: "반복 규칙 ID" })
  @ApiResponse({ status: 200, description: "반복 규칙 실행 완료" })
  async executeRecurrence(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.executeRecurrence(id, user.id);
  }

  // ==========================================================================
  // AI Suggest
  // ==========================================================================

  @Post("ai/chat")
  @ApiOperation({ summary: "콘텐츠 기반 AI 채팅" })
  @ApiResponse({ status: 200, description: "AI 응답 텍스트 반환" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'contentId', 'prompt'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, contentId: { type: 'string', format: 'uuid', description: '콘텐츠 ID' }, prompt: { type: 'string', description: '프롬프트', maxLength: 2000 } } } })
  async aiChat(
    @Body() dto: { studioId: string; contentId: string; prompt: string },
    @CurrentUser() user: User,
  ) {
    return this.aiSuggestService.chat(dto, user.id);
  }

  @Post("ai/chat/stream")
  @ApiOperation({ summary: "콘텐츠 기반 AI 채팅 (스트리밍)" })
  @ApiResponse({ status: 200, description: "SSE 스트림 반환" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'contentId', 'prompt'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, contentId: { type: 'string', format: 'uuid', description: '콘텐츠 ID' }, prompt: { type: 'string', description: '프롬프트', maxLength: 2000 } } } })
  async aiChatStream(
    @Body() dto: { studioId: string; contentId: string; prompt: string },
    @CurrentUser() user: User,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const raw = reply.raw;

    // @Res()는 NestJS/Fastify CORS 미들웨어를 완전히 우회하므로
    // Node.js raw response에 직접 헤더 설정
    const origin = req.headers.origin;
    if (origin) {
      raw.setHeader("Access-Control-Allow-Origin", origin);
      raw.setHeader("Access-Control-Allow-Credentials", "true");
    }
    raw.setHeader("Content-Type", "text/event-stream");
    raw.setHeader("Cache-Control", "no-cache");
    raw.setHeader("Connection", "keep-alive");
    raw.writeHead(200);

    try {
      for await (const chunk of this.aiSuggestService.chatStream(dto, user.id)) {
        reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 요청 실패";
      reply.raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      reply.raw.end();
    }
  }

  @Post("ai/suggest")
  @ApiOperation({ summary: "AI 주제 추천" })
  @ApiResponse({ status: 200, description: "AI 추천 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'topicId'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, topicId: { type: 'string', format: 'uuid', description: '토픽 ID' }, prompt: { type: 'string', description: '추가 프롬프트' } } } })
  async aiSuggest(
    @Body() dto: { studioId: string; topicId: string; prompt?: string },
    @CurrentUser() user: User,
  ) {
    return this.aiSuggestService.suggest(dto, user.id);
  }

  @Post("ai/generate")
  @ApiOperation({ summary: "AI 콘텐츠 생성" })
  @ApiResponse({ status: 200, description: "AI 생성 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'topicId', 'suggestion'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, topicId: { type: 'string', format: 'uuid', description: '토픽 ID' }, suggestion: { type: 'object', required: ['title', 'description', 'nodeType', 'relevance'], properties: { title: { type: 'string' }, description: { type: 'string' }, nodeType: { type: 'string' }, relevance: { type: 'string' } }, description: 'AI 추천 항목' } } } })
  async aiGenerate(
    @Body() dto: { studioId: string; topicId: string; suggestion: { title: string; description: string; nodeType: string; relevance: string } },
    @CurrentUser() user: User,
  ) {
    return this.aiSuggestService.generate(dto, user.id);
  }

  @Post("ai/suggest-and-generate")
  @ApiOperation({ summary: "AI 추천 + 생성 (일괄)" })
  @ApiResponse({ status: 200, description: "AI 추천 및 생성 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'topicId'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, topicId: { type: 'string', format: 'uuid', description: '토픽 ID' }, prompt: { type: 'string', description: '추가 프롬프트' } } } })
  async aiSuggestAndGenerate(
    @Body() dto: { studioId: string; topicId: string; prompt?: string },
    @CurrentUser() user: User,
  ) {
    return this.aiSuggestService.suggestAndGenerate(dto, user.id);
  }

  // ==========================================================================
  // AI Recurrence
  // ==========================================================================

  @Get("ai/recurrences/:studioId")
  @ApiOperation({ summary: "AI 반복 규칙 목록" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "AI 반복 규칙 목록 반환" })
  async listAiRecurrences(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @CurrentUser() user: User,
  ) {
    return this.aiSuggestService.findAiRecurrences(studioId, user.id);
  }

  @Post("ai/recurrences")
  @ApiOperation({ summary: "AI 반복 규칙 생성" })
  @ApiResponse({ status: 201, description: "AI 반복 규칙 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'topicId', 'rule'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, topicId: { type: 'string', format: 'uuid', description: '토픽 ID' }, prompt: { type: 'string', description: '프롬프트' }, rule: { type: 'string', enum: ['weekly', 'biweekly', 'monthly'], description: '반복 주기' }, nextRunAt: { type: 'string', format: 'date-time', description: '다음 실행 시간' } } } })
  async createAiRecurrence(
    @Body() dto: { studioId: string; topicId: string; prompt?: string; rule: "weekly" | "biweekly" | "monthly"; nextRunAt?: string },
    @CurrentUser() user: User,
  ) {
    const data = {
      ...dto,
      nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
    };
    return this.aiSuggestService.createAiRecurrence(data, user.id);
  }

  @Put("ai/recurrences/:id")
  @ApiOperation({ summary: "AI 반복 규칙 수정" })
  @ApiParam({ name: "id", description: "AI 반복 규칙 ID" })
  @ApiResponse({ status: 200, description: "AI 반복 규칙 수정 성공" })
  @ApiBody({ schema: { type: 'object', properties: { prompt: { type: 'string', nullable: true, description: '프롬프트' }, rule: { type: 'string', enum: ['weekly', 'biweekly', 'monthly'], description: '반복 주기' }, nextRunAt: { type: 'string', format: 'date-time', nullable: true, description: '다음 실행 시간' } } } })
  async updateAiRecurrence(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { prompt?: string | null; rule?: "weekly" | "biweekly" | "monthly"; nextRunAt?: string | null },
    @CurrentUser() user: User,
  ) {
    const data: { prompt?: string | null; rule?: "weekly" | "biweekly" | "monthly"; nextRunAt?: Date | null } = {
      rule: dto.rule ?? undefined,
      prompt: dto.prompt === null ? null : dto.prompt ?? undefined,
      nextRunAt: dto.nextRunAt === null ? null : dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
    };
    return this.aiSuggestService.updateAiRecurrence(id, data, user.id);
  }

  @Delete("ai/recurrences/:id")
  @ApiOperation({ summary: "AI 반복 규칙 삭제" })
  @ApiParam({ name: "id", description: "AI 반복 규칙 ID" })
  @ApiResponse({ status: 200, description: "AI 반복 규칙 삭제 성공" })
  async deleteAiRecurrence(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.aiSuggestService.deleteAiRecurrence(id, user.id);
  }

  @Post("ai/recurrences/:id/toggle")
  @ApiOperation({ summary: "AI 반복 규칙 활성/비활성 토글" })
  @ApiParam({ name: "id", description: "AI 반복 규칙 ID" })
  @ApiResponse({ status: 200, description: "AI 반복 규칙 토글 완료" })
  async toggleAiRecurrence(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.aiSuggestService.toggleAiRecurrence(id, user.id);
  }

  // ==========================================================================
  // Brand Voice
  // ==========================================================================

  @Get("brand-voice/:studioId/profile")
  @ApiOperation({ summary: "브랜드 보이스 프로필 조회" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "브랜드 보이스 프로필 반환" })
  async getBrandProfile(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.getProfile(studioId, user.id);
  }

  @Put("brand-voice/:studioId/profile")
  @ApiOperation({ summary: "브랜드 보이스 프로필 생성/수정" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "브랜드 보이스 프로필 저장 성공" })
  @ApiBody({ schema: { type: 'object', required: ['brandName'], properties: { brandName: { type: 'string', description: '브랜드명' }, industry: { type: 'string', nullable: true, description: '산업 분야' }, targetAudience: { type: 'string', nullable: true, description: '타겟 오디언스' }, formality: { type: 'number', description: '격식 수준 (0-100)' }, friendliness: { type: 'number', description: '친근함 수준 (0-100)' }, humor: { type: 'number', description: '유머 수준 (0-100)' }, sentenceLength: { type: 'string', enum: ['short', 'medium', 'long'], description: '문장 길이' }, forbiddenWords: { type: 'array', items: { type: 'string' }, description: '금지 단어' }, requiredWords: { type: 'array', items: { type: 'string' }, description: '필수 단어' }, additionalGuidelines: { type: 'string', nullable: true, description: '추가 가이드라인' } } } })
  async upsertBrandProfile(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @Body() dto: BrandProfileInput,
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.upsertProfile(studioId, dto, user.id);
  }

  @Delete("brand-voice/:studioId/profile")
  @ApiOperation({ summary: "브랜드 보이스 프로필 삭제" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "브랜드 보이스 프로필 삭제 성공" })
  async deleteBrandProfile(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.deleteProfile(studioId, user.id);
  }

  @Put("brand-voice/:studioId/active-preset")
  @ApiOperation({ summary: "활성 프리셋 설정" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "활성 프리셋 설정 성공" })
  @ApiBody({ schema: { type: 'object', required: ['presetId'], properties: { presetId: { type: 'string', format: 'uuid', nullable: true, description: '프리셋 ID (null이면 해제)' } } } })
  async setActivePreset(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @Body() dto: { presetId: string | null },
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.setActivePreset(studioId, dto.presetId, user.id);
  }

  @Get("brand-voice/:studioId/presets")
  @ApiOperation({ summary: "톤 프리셋 목록 조회" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "톤 프리셋 목록 반환" })
  async listPresets(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.listPresets(studioId, user.id);
  }

  @Post("brand-voice/:studioId/presets")
  @ApiOperation({ summary: "톤 프리셋 생성" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 201, description: "톤 프리셋 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['name', 'formality', 'friendliness', 'humor', 'sentenceLength'], properties: { name: { type: 'string', description: '프리셋 이름' }, description: { type: 'string', description: '프리셋 설명' }, formality: { type: 'number', description: '격식 수준' }, friendliness: { type: 'number', description: '친근함 수준' }, humor: { type: 'number', description: '유머 수준' }, sentenceLength: { type: 'string', enum: ['short', 'medium', 'long'], description: '문장 길이' }, systemPromptSuffix: { type: 'string', description: '시스템 프롬프트 접미사' } } } })
  async createPreset(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @Body() dto: CreatePresetInput,
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.createPreset(studioId, dto, user.id);
  }

  @Put("brand-voice/presets/:id")
  @ApiOperation({ summary: "톤 프리셋 수정" })
  @ApiParam({ name: "id", description: "프리셋 ID" })
  @ApiResponse({ status: 200, description: "톤 프리셋 수정 성공" })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string', description: '프리셋 이름' }, description: { type: 'string', nullable: true, description: '프리셋 설명' }, formality: { type: 'number', description: '격식 수준' }, friendliness: { type: 'number', description: '친근함 수준' }, humor: { type: 'number', description: '유머 수준' }, sentenceLength: { type: 'string', enum: ['short', 'medium', 'long'], description: '문장 길이' }, systemPromptSuffix: { type: 'string', nullable: true, description: '시스템 프롬프트 접미사' } } } })
  async updatePreset(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePresetInput,
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.updatePreset(id, dto, user.id);
  }

  @Delete("brand-voice/presets/:id")
  @ApiOperation({ summary: "톤 프리셋 삭제" })
  @ApiParam({ name: "id", description: "프리셋 ID" })
  @ApiResponse({ status: 200, description: "톤 프리셋 삭제 성공" })
  async deletePreset(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.deletePreset(id, user.id);
  }

  @Post("brand-voice/:studioId/suggest-alternatives")
  @ApiOperation({ summary: "대체어 추천" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiResponse({ status: 200, description: "대체어 추천 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['word', 'context'], properties: { word: { type: 'string', description: '대체할 단어' }, context: { type: 'string', description: '문맥' } } } })
  async suggestAlternatives(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @Body() dto: { word: string; context: string },
    @CurrentUser() user: User,
  ) {
    return this.brandVoiceService.suggestAlternatives(studioId, dto.word, dto.context, user.id);
  }

  // ==========================================================================
  // SEO (AI)
  // ==========================================================================

  @Post("seo/suggest-keywords")
  @ApiOperation({ summary: "SEO 키워드 추천" })
  @ApiResponse({ status: 200, description: "키워드 추천 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['studioId', 'contentId', 'title', 'bodyText', 'currentKeywords'], properties: { studioId: { type: 'string', format: 'uuid', description: '스튜디오 ID' }, contentId: { type: 'string', format: 'uuid', description: '콘텐츠 ID' }, title: { type: 'string', description: '제목' }, bodyText: { type: 'string', description: '본문' }, currentKeywords: { type: 'array', items: { type: 'string' }, description: '현재 키워드' } } } })
  async suggestKeywords(
    @Body() dto: { studioId: string; contentId: string; title: string; bodyText: string; currentKeywords: string[] },
    @CurrentUser() user: User,
  ) {
    return this.seoService.suggestKeywords(dto, user.id);
  }

  @Get("seo/:studioId/contents")
  @ApiOperation({ summary: "내부 링크 추천용 스튜디오 콘텐츠 목록" })
  @ApiParam({ name: "studioId", description: "스튜디오 ID" })
  @ApiQuery({ name: "excludeContentId", required: true, type: String })
  @ApiResponse({ status: 200, description: "콘텐츠 목록 반환" })
  async studioContentsForLinking(
    @Param("studioId", ParseUUIDPipe) studioId: string,
    @Query("excludeContentId") excludeContentId: string,
    @CurrentUser() user: User,
  ) {
    return this.seoService.getStudioContentsForLinking(studioId, excludeContentId, user.id);
  }

  // ==========================================================================
  // Repurpose
  // ==========================================================================

  @Post("repurpose/convert")
  @ApiOperation({ summary: "콘텐츠 리퍼포징 변환" })
  @ApiResponse({ status: 200, description: "변환 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['contentId', 'format'], properties: { contentId: { type: 'string', format: 'uuid', description: '콘텐츠 ID' }, format: { type: 'string', enum: ['card_news', 'short_form', 'twitter_thread', 'email_summary'], description: '변환 포맷' }, customInstruction: { type: 'string', description: '커스텀 지시사항' } } } })
  async repurposeConvert(
    @Body() dto: { contentId: string; format: "card_news" | "short_form" | "twitter_thread" | "email_summary"; customInstruction?: string },
    @CurrentUser() user: User,
  ) {
    return this.repurposeService.convert(dto, user.id);
  }

  @Post("repurpose/convert-batch")
  @ApiOperation({ summary: "콘텐츠 리퍼포징 일괄 변환" })
  @ApiResponse({ status: 200, description: "일괄 변환 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['contentId', 'formats'], properties: { contentId: { type: 'string', format: 'uuid', description: '콘텐츠 ID' }, formats: { type: 'array', items: { type: 'string', enum: ['card_news', 'short_form', 'twitter_thread', 'email_summary'] }, description: '변환 포맷 배열' }, customInstruction: { type: 'string', description: '커스텀 지시사항' } } } })
  async repurposeConvertBatch(
    @Body() dto: { contentId: string; formats: Array<"card_news" | "short_form" | "twitter_thread" | "email_summary">; customInstruction?: string },
    @CurrentUser() user: User,
  ) {
    return this.repurposeService.convertBatch(dto, user.id);
  }

  @Get("repurpose/:contentId/derived")
  @ApiOperation({ summary: "파생 콘텐츠 목록 조회" })
  @ApiParam({ name: "contentId", description: "원본 콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "파생 콘텐츠 목록 반환" })
  async repurposeListDerived(
    @Param("contentId", ParseUUIDPipe) contentId: string,
    @CurrentUser() user: User,
  ) {
    return this.repurposeService.listDerived(contentId, user.id);
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  @Post("contents/:contentId/analysis")
  @ApiOperation({ summary: "분석 결과 스냅샷 저장" })
  @ApiParam({ name: "contentId", description: "콘텐츠 ID" })
  @ApiResponse({ status: 201, description: "분석 결과 저장 성공" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["seoScore", "aeoScore", "geoScore", "totalScore", "seoDetails", "aeoDetails", "geoDetails"],
      properties: {
        seoScore: { type: "integer", description: "SEO 점수" },
        aeoScore: { type: "integer", description: "AEO 점수" },
        geoScore: { type: "integer", description: "GEO 점수" },
        totalScore: { type: "integer", description: "통합 점수" },
        seoDetails: { type: "object", description: "SEO 상세 결과" },
        aeoDetails: { type: "object", description: "AEO 상세 결과" },
        geoDetails: { type: "object", description: "GEO 상세 결과" },
        analysisVersion: { type: "string", description: "분석 버전" },
      },
    },
  })
  async saveAnalysis(
    @Param("contentId", ParseUUIDPipe) contentId: string,
    @Body() dto: {
      seoScore: number;
      aeoScore: number;
      geoScore: number;
      totalScore: number;
      seoDetails: Record<string, unknown>;
      aeoDetails: Record<string, unknown>;
      geoDetails: Record<string, unknown>;
      analysisVersion?: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.studioService.saveAnalysisSnapshot(
      { contentId, ...dto },
      user.id,
    );
  }

  @Get("contents/:contentId/analysis/history")
  @ApiOperation({ summary: "분석 이력 조회" })
  @ApiParam({ name: "contentId", description: "콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "분석 이력 목록 반환" })
  async getAnalysisHistory(
    @Param("contentId", ParseUUIDPipe) contentId: string,
    @CurrentUser() user: User,
  ) {
    return this.studioService.getAnalysisHistory(contentId, user.id);
  }

  // ==========================================================================
  // Admin
  // ==========================================================================

  @Get("admin/all")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiOperation({ summary: "전체 스튜디오 목록 (관리자)" })
  @ApiResponse({ status: 200, description: "전체 스튜디오 목록 반환" })
  async adminList() {
    return this.studioService.adminFindAll();
  }
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface BrandProfileInput {
  brandName: string;
  industry?: string | null;
  targetAudience?: string | null;
  formality?: number;
  friendliness?: number;
  humor?: number;
  sentenceLength?: "short" | "medium" | "long";
  forbiddenWords?: string[];
  requiredWords?: string[];
  additionalGuidelines?: string | null;
}

interface CreatePresetInput {
  name: string;
  description?: string;
  formality: number;
  friendliness: number;
  humor: number;
  sentenceLength: "short" | "medium" | "long";
  systemPromptSuffix?: string;
}

interface UpdatePresetInput {
  name?: string;
  description?: string | null;
  formality?: number;
  friendliness?: number;
  humor?: number;
  sentenceLength?: "short" | "medium" | "long";
  systemPromptSuffix?: string | null;
}
