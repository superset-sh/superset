/**
 * Task Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * - Public: 태스크 목록, 태스크 상세, 프로젝트/사이클/라벨/댓글/활동 조회
 * - Auth: 태스크 생성/수정/삭제, 프로젝트/사이클/라벨/댓글 생성/수정/삭제
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { TaskService } from "../service/task.service";
import { TaskProjectService } from "../service/task-project.service";
import { TaskCycleService } from "../service/task-cycle.service";
import { TaskLabelService } from "../service/task-label.service";
import { TaskCommentService } from "../service/task-comment.service";
import { TaskActivityService } from "../service/task-activity.service";
import type { CreateTaskDto } from "../dto/create-task.dto";
import type { UpdateTaskDto } from "../dto/update-task.dto";
import type { BulkUpdateOrderDto } from "../dto/bulk-update-order.dto";

@ApiTags("Task")
@Controller("task")
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly projectService: TaskProjectService,
    private readonly cycleService: TaskCycleService,
    private readonly labelService: TaskLabelService,
    private readonly commentService: TaskCommentService,
    private readonly activityService: TaskActivityService,
  ) {}

  // ============================================================================
  // Task Endpoints
  // ============================================================================

  /** GET /api/task/tasks - 태스크 목록 조회 */
  @Get("tasks")
  @ApiOperation({ summary: "태스크 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "페이지 번호 (기본값: 1)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "페이지당 개수 (기본값: 50, 최대: 100)" })
  @ApiQuery({ name: "query", required: false, type: String, description: "제목 검색어" })
  @ApiQuery({ name: "sortBy", required: false, type: String, description: "정렬 기준 (createdAt, updatedAt, priority, dueDate, sortOrder)" })
  @ApiQuery({ name: "sortOrder", required: false, type: String, description: "정렬 방향 (asc, desc)" })
  @ApiResponse({ status: 200, description: "태스크 목록 반환" })
  async list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("query") query?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
  ) {
    return this.taskService.findAll({
      page,
      limit,
      query,
      sortBy: sortBy as "createdAt" | "updatedAt" | "priority" | "dueDate" | "sortOrder",
      sortOrder: sortOrder as "asc" | "desc",
    });
  }

  /** GET /api/task/tasks/:identifier - 식별자로 태스크 조회 */
  @Get("tasks/:identifier")
  @ApiOperation({ summary: "식별자로 태스크 상세 조회" })
  @ApiParam({ name: "identifier", description: "태스크 식별자 (예: TASK-123)" })
  @ApiResponse({ status: 200, description: "태스크 상세 정보 반환" })
  @ApiResponse({ status: 404, description: "태스크를 찾을 수 없음" })
  async byIdentifier(@Param("identifier") identifier: string) {
    return this.taskService.findByIdentifier(identifier);
  }

  /** POST /api/task/tasks - 태스크 생성 */
  @Post("tasks")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "태스크 생성" })
  @ApiResponse({ status: 201, description: "태스크 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async create(
    @CurrentUser() user: User,
    @Body() body: CreateTaskDto,
  ) {
    return this.taskService.create(body, user.id);
  }

  /** PATCH /api/task/tasks/bulk-order - 태스크 순서/상태 일괄 업데이트 */
  @Patch("tasks/bulk-order")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "태스크 순서/상태 일괄 업데이트 (칸반 D&D)" })
  @ApiResponse({ status: 200, description: "일괄 업데이트 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async bulkUpdateOrder(
    @Body() dto: BulkUpdateOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.taskService.bulkUpdateOrder(dto.updates, user.id);
  }

  /** PATCH /api/task/tasks/:id - 태스크 수정 */
  @Patch("tasks/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "태스크 수정" })
  @ApiParam({ name: "id", description: "태스크 UUID" })
  @ApiResponse({ status: 200, description: "태스크 수정 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 404, description: "태스크를 찾을 수 없음" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() body: UpdateTaskDto,
  ) {
    return this.taskService.update(id, body, user.id);
  }

  /** DELETE /api/task/tasks/:id - 태스크 삭제 */
  @Delete("tasks/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "태스크 삭제" })
  @ApiParam({ name: "id", description: "태스크 UUID" })
  @ApiResponse({ status: 200, description: "태스크 삭제 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 404, description: "태스크를 찾을 수 없음" })
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.taskService.delete(id, user.id);
  }

  // ============================================================================
  // Project Endpoints
  // ============================================================================

  /** GET /api/task/projects - 프로젝트 목록 조회 */
  @Get("projects")
  @ApiOperation({ summary: "프로젝트 목록 조회" })
  @ApiResponse({ status: 200, description: "프로젝트 목록 반환" })
  async projectList() {
    return this.projectService.findAll();
  }

  /** POST /api/task/projects - 프로젝트 생성 */
  @Post("projects")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "프로젝트 생성" })
  @ApiResponse({ status: 201, description: "프로젝트 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 409, description: "슬러그 중복" })
  async projectCreate(
    @CurrentUser() user: User,
    @Body()
    body: {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      status?: "planned" | "started" | "paused" | "completed" | "canceled";
      startDate?: string;
      targetDate?: string;
    },
  ) {
    return this.projectService.create(body, user.id);
  }

  /** PATCH /api/task/projects/:id - 프로젝트 수정 */
  @Patch("projects/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "프로젝트 수정" })
  @ApiParam({ name: "id", description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "프로젝트 수정 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 404, description: "프로젝트를 찾을 수 없음" })
  async projectUpdate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
      status?: "planned" | "started" | "paused" | "completed" | "canceled";
      startDate?: string;
      targetDate?: string;
    },
  ) {
    return this.projectService.update(id, body);
  }

  /** DELETE /api/task/projects/:id - 프로젝트 삭제 */
  @Delete("projects/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "프로젝트 삭제" })
  @ApiParam({ name: "id", description: "프로젝트 UUID" })
  @ApiResponse({ status: 200, description: "프로젝트 삭제 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 404, description: "프로젝트를 찾을 수 없음" })
  async projectDelete(@Param("id", ParseUUIDPipe) id: string) {
    return this.projectService.delete(id);
  }

  // ============================================================================
  // Cycle Endpoints
  // ============================================================================

  /** GET /api/task/cycles - 사이클 목록 조회 */
  @Get("cycles")
  @ApiOperation({ summary: "사이클 목록 조회" })
  @ApiResponse({ status: 200, description: "사이클 목록 반환" })
  async cycleList() {
    return this.cycleService.findAll();
  }

  /** POST /api/task/cycles - 사이클 생성 */
  @Post("cycles")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "사이클 생성" })
  @ApiResponse({ status: 201, description: "사이클 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async cycleCreate(
    @CurrentUser() user: User,
    @Body()
    body: {
      name?: string;
      startDate: string;
      endDate: string;
      status?: "active" | "completed";
    },
  ) {
    return this.cycleService.create(body, user.id);
  }

  /** PATCH /api/task/cycles/:id - 사이클 수정 */
  @Patch("cycles/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "사이클 수정" })
  @ApiParam({ name: "id", description: "사이클 UUID" })
  @ApiResponse({ status: 200, description: "사이클 수정 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 404, description: "사이클을 찾을 수 없음" })
  async cycleUpdate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    body: {
      name?: string;
      startDate?: string;
      endDate?: string;
      status?: "active" | "completed";
    },
  ) {
    return this.cycleService.update(id, body);
  }

  // ============================================================================
  // Label Endpoints
  // ============================================================================

  /** GET /api/task/labels - 라벨 목록 조회 */
  @Get("labels")
  @ApiOperation({ summary: "라벨 목록 조회" })
  @ApiResponse({ status: 200, description: "라벨 목록 반환" })
  async labelList() {
    return this.labelService.findAll();
  }

  /** POST /api/task/labels - 라벨 생성 */
  @Post("labels")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "라벨 생성" })
  @ApiResponse({ status: 201, description: "라벨 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async labelCreate(
    @Body() body: { name: string; color: string; description?: string },
  ) {
    return this.labelService.create(body);
  }

  /** DELETE /api/task/labels/:id - 라벨 삭제 */
  @Delete("labels/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "라벨 삭제" })
  @ApiParam({ name: "id", description: "라벨 UUID" })
  @ApiResponse({ status: 200, description: "라벨 삭제 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 404, description: "라벨을 찾을 수 없음" })
  async labelDelete(@Param("id", ParseUUIDPipe) id: string) {
    return this.labelService.delete(id);
  }

  // ============================================================================
  // Comment Endpoints
  // ============================================================================

  /** GET /api/task/comments/:taskId - 태스크별 댓글 목록 조회 */
  @Get("comments/:taskId")
  @ApiOperation({ summary: "태스크별 댓글 목록 조회" })
  @ApiParam({ name: "taskId", description: "태스크 UUID" })
  @ApiResponse({ status: 200, description: "댓글 목록 반환" })
  async commentList(@Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.commentService.findByTaskId(taskId);
  }

  /** POST /api/task/comments - 댓글 생성 */
  @Post("comments")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "댓글 생성" })
  @ApiResponse({ status: 201, description: "댓글 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async commentCreate(
    @CurrentUser() user: User,
    @Body() body: { taskId: string; content: string },
  ) {
    return this.commentService.create(body, user.id);
  }

  /** PATCH /api/task/comments/:id - 댓글 수정 */
  @Patch("comments/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "댓글 수정" })
  @ApiParam({ name: "id", description: "댓글 UUID" })
  @ApiResponse({ status: 200, description: "댓글 수정 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "본인 댓글만 수정 가능" })
  @ApiResponse({ status: 404, description: "댓글을 찾을 수 없음" })
  async commentUpdate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() body: { content: string },
  ) {
    return this.commentService.update(id, body.content, user.id);
  }

  /** DELETE /api/task/comments/:id - 댓글 삭제 */
  @Delete("comments/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "댓글 삭제" })
  @ApiParam({ name: "id", description: "댓글 UUID" })
  @ApiResponse({ status: 200, description: "댓글 삭제 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "본인 댓글만 삭제 가능" })
  @ApiResponse({ status: 404, description: "댓글을 찾을 수 없음" })
  async commentDelete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.commentService.delete(id, user.id);
  }

  // ============================================================================
  // Activity Endpoints
  // ============================================================================

  /** GET /api/task/activities/:taskId - 태스크별 활동 이력 조회 */
  @Get("activities/:taskId")
  @ApiOperation({ summary: "태스크별 활동 이력 조회" })
  @ApiParam({ name: "taskId", description: "태스크 UUID" })
  @ApiResponse({ status: 200, description: "활동 이력 반환" })
  async activityList(@Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.activityService.findByTaskId(taskId);
  }
}
