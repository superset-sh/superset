/**
 * Story Studio Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * - Auth: 모든 엔드포인트는 인증 필요 (JwtAuthGuard)
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
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { ProjectService } from "../service/project.service";
import { ChapterService } from "../service/chapter.service";
import { GraphService } from "../service/graph.service";
import { FlagService } from "../service/flag.service";
import { DialogueService } from "../service/dialogue.service";
import { CharacterService } from "../service/character.service";
import { ExportService } from "../service/export.service";
import { ValidationService } from "../service/validation.service";

@ApiTags("Story Studio")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("story-studio")
export class StoryStudioController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly chapterService: ChapterService,
    private readonly graphService: GraphService,
    private readonly flagService: FlagService,
    private readonly dialogueService: DialogueService,
    private readonly characterService: CharacterService,
    private readonly exportService: ExportService,
    private readonly validationService: ValidationService,
  ) {}

  // ============================================================================
  // Project Endpoints
  // ============================================================================

  /** GET /api/story-studio/projects - 프로젝트 목록 조회 */
  @Get("projects")
  @ApiOperation({ summary: "프로젝트 목록 조회" })
  @ApiResponse({ status: 200, description: "프로젝트 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async listProjects(@CurrentUser() user: User) {
    return this.projectService.findAll(user.id);
  }

  /** POST /api/story-studio/projects - 프로젝트 생성 */
  @Post("projects")
  @ApiOperation({ summary: "프로젝트 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "프로젝트 제목", minLength: 1, maxLength: 200 },
        genre: { type: "string", description: "장르", maxLength: 50 },
        description: { type: "string", description: "설명", maxLength: 2000 },
      },
      required: ["title"],
    },
  })
  @ApiResponse({ status: 201, description: "프로젝트 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async createProject(
    @CurrentUser() user: User,
    @Body() body: { title: string; genre?: string; description?: string },
  ) {
    return this.projectService.create(body, user.id);
  }

  /** GET /api/story-studio/projects/:id/export - 프로젝트 JSON 내보내기 */
  @Get("projects/:id/export")
  @ApiOperation({ summary: "프로젝트 전체 데이터 JSON 내보내기" })
  @ApiParam({ name: "id", description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "게임용 JSON 데이터 반환" })
  @ApiResponse({ status: 404, description: "프로젝트를 찾을 수 없음" })
  async exportProject(@Param("id", ParseUUIDPipe) id: string) {
    return this.exportService.exportProject(id);
  }

  /** GET /api/story-studio/projects/:id/validate - 프로젝트 그래프 검증 */
  @Get("projects/:id/validate")
  @ApiOperation({ summary: "프로젝트 그래프 검증 (데드엔드, 도달 불가 노드 등)" })
  @ApiParam({ name: "id", description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "검증 결과 반환" })
  @ApiResponse({ status: 404, description: "프로젝트를 찾을 수 없음" })
  async validateProject(@Param("id", ParseUUIDPipe) id: string) {
    return this.validationService.validateProject(id);
  }

  /** GET /api/story-studio/projects/:id - 프로젝트 상세 조회 */
  @Get("projects/:id")
  @ApiOperation({ summary: "프로젝트 상세 조회" })
  @ApiParam({ name: "id", description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "프로젝트 정보 반환" })
  @ApiResponse({ status: 404, description: "프로젝트를 찾을 수 없음" })
  async getProject(@Param("id", ParseUUIDPipe) id: string) {
    return this.projectService.findById(id);
  }

  /** PUT /api/story-studio/projects/:id - 프로젝트 수정 */
  @Put("projects/:id")
  @ApiOperation({ summary: "프로젝트 수정" })
  @ApiParam({ name: "id", description: "프로젝트 UUID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "프로젝트 제목" },
        genre: { type: "string", description: "장르" },
        description: { type: "string", description: "설명" },
        status: { type: "string", description: "상태" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "프로젝트 수정 성공" })
  @ApiResponse({ status: 404, description: "프로젝트를 찾을 수 없음" })
  async updateProject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: Partial<{ title: string; genre: string; description: string; status: string }>,
  ) {
    return this.projectService.update(id, body);
  }

  /** DELETE /api/story-studio/projects/:id - 프로젝트 삭제 */
  @Delete("projects/:id")
  @ApiOperation({ summary: "프로젝트 삭제 (soft delete)" })
  @ApiParam({ name: "id", description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "프로젝트 삭제 성공" })
  @ApiResponse({ status: 404, description: "프로젝트를 찾을 수 없음" })
  async deleteProject(@Param("id", ParseUUIDPipe) id: string) {
    return this.projectService.delete(id);
  }

  // ============================================================================
  // Chapter Endpoints
  // ============================================================================

  /** GET /api/story-studio/chapters?projectId= - 챕터 목록 조회 */
  @Get("chapters")
  @ApiOperation({ summary: "프로젝트별 챕터 목록 조회" })
  @ApiQuery({ name: "projectId", required: true, type: String, description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "챕터 목록 반환" })
  async listChapters(@Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.chapterService.findByProject(projectId);
  }

  /** POST /api/story-studio/chapters - 챕터 생성 */
  @Post("chapters")
  @ApiOperation({ summary: "챕터 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid", description: "프로젝트 UUID" },
        title: { type: "string", description: "챕터 제목", minLength: 1, maxLength: 200 },
        code: { type: "string", description: "챕터 코드", minLength: 1, maxLength: 50 },
        order: { type: "number", description: "순서" },
        summary: { type: "string", description: "요약" },
      },
      required: ["projectId", "title", "code"],
    },
  })
  @ApiResponse({ status: 201, description: "챕터 생성 성공" })
  async createChapter(
    @Body() body: { projectId: string; title: string; code: string; order?: number; summary?: string },
  ) {
    const { projectId, ...rest } = body;
    return this.chapterService.create(rest, projectId);
  }

  /** PUT /api/story-studio/chapters/reorder - 챕터 순서 변경 */
  @Put("chapters/reorder")
  @ApiOperation({ summary: "챕터 순서 변경" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid", description: "프로젝트 UUID" },
        ids: { type: "array", items: { type: "string", format: "uuid" }, description: "정렬된 챕터 UUID 배열" },
      },
      required: ["projectId", "ids"],
    },
  })
  @ApiResponse({ status: 200, description: "챕터 순서 변경 성공" })
  async reorderChapters(@Body() body: { projectId: string; ids: string[] }) {
    return this.chapterService.reorder(body.projectId, body.ids);
  }

  /** GET /api/story-studio/chapters/:id - 챕터 상세 조회 */
  @Get("chapters/:id")
  @ApiOperation({ summary: "챕터 상세 조회" })
  @ApiParam({ name: "id", description: "챕터 UUID" })
  @ApiResponse({ status: 200, description: "챕터 정보 반환" })
  @ApiResponse({ status: 404, description: "챕터를 찾을 수 없음" })
  async getChapter(@Param("id", ParseUUIDPipe) id: string) {
    return this.chapterService.findById(id);
  }

  /** PUT /api/story-studio/chapters/:id - 챕터 수정 */
  @Put("chapters/:id")
  @ApiOperation({ summary: "챕터 수정" })
  @ApiParam({ name: "id", description: "챕터 UUID" })
  @ApiResponse({ status: 200, description: "챕터 수정 성공" })
  @ApiResponse({ status: 404, description: "챕터를 찾을 수 없음" })
  async updateChapter(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: Partial<{ title: string; code: string; order: number; summary: string; status: string; estimatedPlaytime: string }>,
  ) {
    return this.chapterService.update(id, body);
  }

  /** DELETE /api/story-studio/chapters/:id - 챕터 삭제 */
  @Delete("chapters/:id")
  @ApiOperation({ summary: "챕터 삭제 (soft delete)" })
  @ApiParam({ name: "id", description: "챕터 UUID" })
  @ApiResponse({ status: 200, description: "챕터 삭제 성공" })
  @ApiResponse({ status: 404, description: "챕터를 찾을 수 없음" })
  async deleteChapter(@Param("id", ParseUUIDPipe) id: string) {
    return this.chapterService.delete(id);
  }

  // ============================================================================
  // Graph Endpoints
  // ============================================================================

  /** GET /api/story-studio/graph/:chapterId - 그래프 조회 (노드 + 엣지) */
  @Get("graph/:chapterId")
  @ApiOperation({ summary: "챕터별 그래프 조회 (노드 + 엣지)" })
  @ApiParam({ name: "chapterId", description: "챕터 UUID" })
  @ApiResponse({ status: 200, description: "그래프 데이터 반환 ({ nodes, edges })" })
  async getGraph(@Param("chapterId", ParseUUIDPipe) chapterId: string) {
    return this.graphService.getGraph(chapterId);
  }

  /** POST /api/story-studio/graph/nodes - 노드 생성 */
  @Post("graph/nodes")
  @ApiOperation({ summary: "그래프 노드 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        chapterId: { type: "string", format: "uuid" },
        type: { type: "string", description: "노드 타입" },
        code: { type: "string", description: "노드 코드" },
        label: { type: "string", description: "노드 레이블" },
        positionX: { type: "number", description: "X 좌표" },
        positionY: { type: "number", description: "Y 좌표" },
      },
      required: ["projectId", "chapterId", "type", "code", "label"],
    },
  })
  @ApiResponse({ status: 201, description: "노드 생성 성공" })
  async createNode(
    @Body() body: {
      projectId: string;
      chapterId: string;
      type: string;
      code: string;
      label: string;
      positionX?: number;
      positionY?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.graphService.createNode(body);
  }

  /** PUT /api/story-studio/graph/nodes/:id - 노드 수정 */
  @Put("graph/nodes/:id")
  @ApiOperation({ summary: "그래프 노드 수정" })
  @ApiParam({ name: "id", description: "노드 UUID" })
  @ApiResponse({ status: 200, description: "노드 수정 성공" })
  @ApiResponse({ status: 404, description: "노드를 찾을 수 없음" })
  async updateNode(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: Partial<{ label: string; code: string; type: string; positionX: number; positionY: number; metadata: Record<string, unknown> }>,
  ) {
    return this.graphService.updateNode(id, body);
  }

  /** DELETE /api/story-studio/graph/nodes/:id - 노드 삭제 */
  @Delete("graph/nodes/:id")
  @ApiOperation({ summary: "그래프 노드 삭제" })
  @ApiParam({ name: "id", description: "노드 UUID" })
  @ApiResponse({ status: 200, description: "노드 삭제 성공" })
  @ApiResponse({ status: 404, description: "노드를 찾을 수 없음" })
  async deleteNode(@Param("id", ParseUUIDPipe) id: string) {
    return this.graphService.deleteNode(id);
  }

  /** POST /api/story-studio/graph/edges - 엣지 생성 */
  @Post("graph/edges")
  @ApiOperation({ summary: "그래프 엣지 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        chapterId: { type: "string", format: "uuid" },
        sourceNodeId: { type: "string", format: "uuid" },
        targetNodeId: { type: "string", format: "uuid" },
        label: { type: "string", description: "엣지 레이블" },
      },
      required: ["projectId", "chapterId", "sourceNodeId", "targetNodeId"],
    },
  })
  @ApiResponse({ status: 201, description: "엣지 생성 성공" })
  async createEdge(
    @Body() body: {
      projectId: string;
      chapterId: string;
      sourceNodeId: string;
      targetNodeId: string;
      label?: string;
      conditions?: unknown[];
      effects?: unknown[];
    },
  ) {
    return this.graphService.createEdge(body);
  }

  /** PUT /api/story-studio/graph/edges/:id - 엣지 수정 */
  @Put("graph/edges/:id")
  @ApiOperation({ summary: "그래프 엣지 수정" })
  @ApiParam({ name: "id", description: "엣지 UUID" })
  @ApiResponse({ status: 200, description: "엣지 수정 성공" })
  @ApiResponse({ status: 404, description: "엣지를 찾을 수 없음" })
  async updateEdge(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: Partial<{ label: string; conditions: unknown[]; effects: unknown[]; order: number }>,
  ) {
    return this.graphService.updateEdge(id, body);
  }

  /** DELETE /api/story-studio/graph/edges/:id - 엣지 삭제 */
  @Delete("graph/edges/:id")
  @ApiOperation({ summary: "그래프 엣지 삭제" })
  @ApiParam({ name: "id", description: "엣지 UUID" })
  @ApiResponse({ status: 200, description: "엣지 삭제 성공" })
  @ApiResponse({ status: 404, description: "엣지를 찾을 수 없음" })
  async deleteEdge(@Param("id", ParseUUIDPipe) id: string) {
    return this.graphService.deleteEdge(id);
  }

  /** PUT /api/story-studio/graph/nodes/positions - 노드 위치 일괄 업데이트 */
  @Put("graph/nodes/positions")
  @ApiOperation({ summary: "그래프 노드 위치 일괄 업데이트" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              positionX: { type: "number" },
              positionY: { type: "number" },
            },
            required: ["id", "positionX", "positionY"],
          },
          description: "노드별 위치 업데이트 배열",
        },
      },
      required: ["updates"],
    },
  })
  @ApiResponse({ status: 200, description: "노드 위치 업데이트 성공" })
  async updateNodePositions(
    @Body() body: { updates: { id: string; positionX: number; positionY: number }[] },
  ) {
    return this.graphService.updateNodePositions(body.updates);
  }

  // ============================================================================
  // Flag Endpoints
  // ============================================================================

  /** GET /api/story-studio/flags?projectId= - 플래그 목록 조회 */
  @Get("flags")
  @ApiOperation({ summary: "프로젝트별 플래그 목록 조회" })
  @ApiQuery({ name: "projectId", required: true, type: String, description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "플래그 목록 반환" })
  async listFlags(@Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.flagService.findByProject(projectId);
  }

  /** POST /api/story-studio/flags - 플래그 생성 */
  @Post("flags")
  @ApiOperation({ summary: "플래그 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        name: { type: "string", description: "플래그 이름", minLength: 1, maxLength: 100 },
        type: { type: "string", description: "플래그 타입 (boolean/number/string)" },
        defaultValue: { type: "string", description: "기본값" },
        category: { type: "string", description: "카테고리" },
        description: { type: "string", description: "설명" },
        isInterpolatable: { type: "boolean", description: "보간 가능 여부" },
      },
      required: ["projectId", "name"],
    },
  })
  @ApiResponse({ status: 201, description: "플래그 생성 성공" })
  async createFlag(
    @Body() body: {
      projectId: string;
      name: string;
      type?: string;
      defaultValue?: string;
      category?: string;
      description?: string;
      isInterpolatable?: boolean;
    },
  ) {
    return this.flagService.create(body);
  }

  /** PUT /api/story-studio/flags/:id - 플래그 수정 */
  @Put("flags/:id")
  @ApiOperation({ summary: "플래그 수정" })
  @ApiParam({ name: "id", description: "플래그 UUID" })
  @ApiResponse({ status: 200, description: "플래그 수정 성공" })
  @ApiResponse({ status: 404, description: "플래그를 찾을 수 없음" })
  async updateFlag(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: Partial<{ name: string; type: string; defaultValue: string; category: string; description: string; isInterpolatable: boolean }>,
  ) {
    return this.flagService.update(id, body);
  }

  /** DELETE /api/story-studio/flags/:id - 플래그 삭제 */
  @Delete("flags/:id")
  @ApiOperation({ summary: "플래그 삭제" })
  @ApiParam({ name: "id", description: "플래그 UUID" })
  @ApiResponse({ status: 200, description: "플래그 삭제 성공" })
  @ApiResponse({ status: 404, description: "플래그를 찾을 수 없음" })
  async deleteFlag(@Param("id", ParseUUIDPipe) id: string) {
    return this.flagService.delete(id);
  }

  // ============================================================================
  // Dialogue Endpoints
  // ============================================================================

  /** GET /api/story-studio/dialogues?nodeId= - 대사 목록 조회 */
  @Get("dialogues")
  @ApiOperation({ summary: "노드별 대사 목록 조회" })
  @ApiQuery({ name: "nodeId", required: true, type: String, description: "분기 노드 UUID" })
  @ApiResponse({ status: 200, description: "대사 목록 반환" })
  async listDialogues(@Query("nodeId", ParseUUIDPipe) nodeId: string) {
    return this.dialogueService.findByNode(nodeId);
  }

  /** POST /api/story-studio/dialogues - 대사 생성 */
  @Post("dialogues")
  @ApiOperation({ summary: "대사 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        chapterId: { type: "string", format: "uuid" },
        branchNodeId: { type: "string", format: "uuid" },
        type: { type: "string", description: "대사 유형" },
        speakerId: { type: "string", format: "uuid", description: "화자 UUID" },
        emotion: { type: "string", description: "감정" },
        content: { type: "string", description: "대사 내용", minLength: 1 },
        direction: { type: "string", description: "연출 지시" },
        order: { type: "number", description: "순서" },
      },
      required: ["projectId", "chapterId", "branchNodeId", "content"],
    },
  })
  @ApiResponse({ status: 201, description: "대사 생성 성공" })
  async createDialogue(
    @Body() body: {
      projectId: string;
      chapterId: string;
      branchNodeId: string;
      type?: string;
      speakerId?: string;
      emotion?: string;
      content: string;
      direction?: string;
      timing?: string;
      voiceNote?: string;
      tags?: string[];
      order?: number;
    },
  ) {
    return this.dialogueService.create(body);
  }

  /** PUT /api/story-studio/dialogues/reorder - 대사 순서 변경 */
  @Put("dialogues/reorder")
  @ApiOperation({ summary: "대사 순서 변경" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        nodeId: { type: "string", format: "uuid", description: "분기 노드 UUID" },
        ids: { type: "array", items: { type: "string", format: "uuid" }, description: "정렬된 대사 UUID 배열" },
      },
      required: ["nodeId", "ids"],
    },
  })
  @ApiResponse({ status: 200, description: "대사 순서 변경 성공" })
  async reorderDialogues(@Body() body: { nodeId: string; ids: string[] }) {
    return this.dialogueService.reorder(body.nodeId, body.ids);
  }

  /** POST /api/story-studio/dialogues/bulk - 대사 일괄 생성 */
  @Post("dialogues/bulk")
  @ApiOperation({ summary: "대사 일괄 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        nodeId: { type: "string", format: "uuid", description: "분기 노드 UUID" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              projectId: { type: "string", format: "uuid" },
              chapterId: { type: "string", format: "uuid" },
              type: { type: "string" },
              speakerId: { type: "string", format: "uuid" },
              emotion: { type: "string" },
              content: { type: "string" },
              direction: { type: "string" },
            },
            required: ["projectId", "chapterId", "content"],
          },
          description: "대사 배열",
        },
      },
      required: ["nodeId", "lines"],
    },
  })
  @ApiResponse({ status: 201, description: "대사 일괄 생성 성공" })
  async bulkCreateDialogues(
    @Body() body: {
      nodeId: string;
      lines: {
        projectId: string;
        chapterId: string;
        type?: string;
        speakerId?: string;
        emotion?: string;
        content: string;
        direction?: string;
      }[];
    },
  ) {
    return this.dialogueService.bulkCreate(body.nodeId, body.lines);
  }

  /** PUT /api/story-studio/dialogues/:id - 대사 수정 */
  @Put("dialogues/:id")
  @ApiOperation({ summary: "대사 수정" })
  @ApiParam({ name: "id", description: "대사 UUID" })
  @ApiResponse({ status: 200, description: "대사 수정 성공" })
  @ApiResponse({ status: 404, description: "대사를 찾을 수 없음" })
  async updateDialogue(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    body: Partial<{
      type: string;
      speakerId: string;
      emotion: string;
      content: string;
      direction: string;
      timing: string;
      voiceNote: string;
      tags: string[];
    }>,
  ) {
    return this.dialogueService.update(id, body);
  }

  /** DELETE /api/story-studio/dialogues/:id - 대사 삭제 */
  @Delete("dialogues/:id")
  @ApiOperation({ summary: "대사 삭제 (soft delete)" })
  @ApiParam({ name: "id", description: "대사 UUID" })
  @ApiResponse({ status: 200, description: "대사 삭제 성공" })
  @ApiResponse({ status: 404, description: "대사를 찾을 수 없음" })
  async deleteDialogue(@Param("id", ParseUUIDPipe) id: string) {
    return this.dialogueService.delete(id);
  }

  // ============================================================================
  // Character Endpoints
  // ============================================================================

  /** GET /api/story-studio/characters?projectId= - 캐릭터 목록 조회 */
  @Get("characters")
  @ApiOperation({ summary: "프로젝트별 캐릭터 목록 조회" })
  @ApiQuery({ name: "projectId", required: true, type: String, description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "캐릭터 목록 반환" })
  async listCharacters(@Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.characterService.findByProject(projectId);
  }

  /** POST /api/story-studio/characters - 캐릭터 생성 */
  @Post("characters")
  @ApiOperation({ summary: "캐릭터 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        name: { type: "string", description: "캐릭터 이름", minLength: 1, maxLength: 100 },
        code: { type: "string", description: "캐릭터 코드", minLength: 1, maxLength: 50 },
        role: { type: "string", description: "역할" },
        personality: { type: "string", description: "성격" },
        speechStyle: { type: "string", description: "말투" },
      },
      required: ["projectId", "name", "code"],
    },
  })
  @ApiResponse({ status: 201, description: "캐릭터 생성 성공" })
  async createCharacter(
    @Body() body: {
      projectId: string;
      name: string;
      code: string;
      role?: string;
      personality?: string;
      speechStyle?: string;
    },
  ) {
    return this.characterService.create(body);
  }

  /** PUT /api/story-studio/characters/:id - 캐릭터 수정 */
  @Put("characters/:id")
  @ApiOperation({ summary: "캐릭터 수정" })
  @ApiParam({ name: "id", description: "캐릭터 UUID" })
  @ApiResponse({ status: 200, description: "캐릭터 수정 성공" })
  @ApiResponse({ status: 404, description: "캐릭터를 찾을 수 없음" })
  async updateCharacter(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: Partial<{ name: string; code: string; role: string; personality: string; speechStyle: string }>,
  ) {
    return this.characterService.update(id, body);
  }

  /** DELETE /api/story-studio/characters/:id - 캐릭터 삭제 */
  @Delete("characters/:id")
  @ApiOperation({ summary: "캐릭터 삭제" })
  @ApiParam({ name: "id", description: "캐릭터 UUID" })
  @ApiResponse({ status: 200, description: "캐릭터 삭제 성공" })
  @ApiResponse({ status: 404, description: "캐릭터를 찾을 수 없음" })
  async deleteCharacter(@Param("id", ParseUUIDPipe) id: string) {
    return this.characterService.delete(id);
  }
}
