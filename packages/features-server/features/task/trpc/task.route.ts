/**
 * Task tRPC Router
 */
import { z } from "zod";
import {
  router,
  publicProcedure,
  authProcedure,
  getAuthUserId,
  createServiceContainer,
} from "../../../core/trpc";
import type { TaskService } from "../service/task.service";
import type { TaskActivityService } from "../service/task-activity.service";
import type { TaskProjectService } from "../service/task-project.service";
import type { TaskCycleService } from "../service/task-cycle.service";
import type { TaskLabelService } from "../service/task-label.service";
import type { TaskCommentService } from "../service/task-comment.service";
import { createTaskSchema } from "../dto/create-task.dto";
import { updateTaskSchema } from "../dto/update-task.dto";
import { taskListSchema } from "../dto/task-list.dto";
import { bulkUpdateOrderSchema } from "../dto/bulk-update-order.dto";

// Service container (injected via NestJS onModuleInit)
const services = createServiceContainer<{
  taskService: TaskService;
  projectService: TaskProjectService;
  cycleService: TaskCycleService;
  labelService: TaskLabelService;
  commentService: TaskCommentService;
  activityService: TaskActivityService;
}>();

export const injectTaskServices = services.inject;

// ============================================================================
// Project schemas
// ============================================================================

const createProjectSchema = z.object({
  name: z.string().min(1).max(200).describe("프로젝트 이름"),
  description: z.string().optional().describe("프로젝트 설명"),
  icon: z.string().max(50).optional().describe("아이콘"),
  color: z.string().max(7).optional().describe("색상 코드"),
  status: z
    .enum(["planned", "started", "paused", "completed", "canceled"])
    .optional()
    .describe("프로젝트 상태"),
  startDate: z.string().optional().describe("시작일"),
  targetDate: z.string().optional().describe("목표일"),
});

const updateProjectSchema = createProjectSchema.partial();

// ============================================================================
// Cycle schemas
// ============================================================================

const createCycleSchema = z.object({
  name: z.string().max(200).optional().describe("사이클 이름"),
  startDate: z.string().describe("시작일"),
  endDate: z.string().describe("종료일"),
  status: z.enum(["active", "completed"]).optional().describe("사이클 상태"),
});

const updateCycleSchema = createCycleSchema.partial();

// ============================================================================
// Label schemas
// ============================================================================

const createLabelSchema = z.object({
  name: z.string().min(1).max(100).describe("라벨 이름"),
  color: z.string().max(7).describe("색상 코드"),
  description: z.string().optional().describe("라벨 설명"),
});

// ============================================================================
// Comment schemas
// ============================================================================

const createCommentSchema = z.object({
  taskId: z.string().uuid().describe("태스크 UUID"),
  content: z.string().min(1).describe("댓글 내용"),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).describe("댓글 내용"),
});

// ============================================================================
// Router
// ============================================================================

export const taskRouter = router({
  // ========================================
  // Task Routes
  // ========================================

  /** 태스크 목록 조회 */
  list: publicProcedure
    .input(taskListSchema.optional())
    .query(async ({ input }) => {
      return services.get().taskService.findAll(input ?? {});
    }),

  /** 식별자로 태스크 상세 조회 */
  byIdentifier: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .query(async ({ input }) => {
      return services.get().taskService.findByIdentifier(input.identifier);
    }),

  /** 태스크 생성 */
  create: authProcedure
    .input(createTaskSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().taskService.create(input, userId);
    }),

  /** 태스크 수정 */
  update: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updateTaskSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().taskService.update(input.id, input.data, userId);
    }),

  /** 태스크 삭제 */
  delete: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().taskService.delete(input.id, userId);
    }),

  /** 태스크 순서/상태 일괄 업데이트 (칸반 D&D) */
  bulkUpdateOrder: authProcedure
    .input(bulkUpdateOrderSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().taskService.bulkUpdateOrder(input.updates, userId);
    }),

  // ========================================
  // Project Routes
  // ========================================

  /** 프로젝트 목록 조회 */
  projectList: publicProcedure.query(async () => {
    return services.get().projectService.findAll();
  }),

  /** 프로젝트 상세 조회 */
  projectById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().projectService.findById(input.id);
    }),

  /** 프로젝트 생성 */
  projectCreate: authProcedure
    .input(createProjectSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().projectService.create(input, userId);
    }),

  /** 프로젝트 수정 */
  projectUpdate: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updateProjectSchema }))
    .mutation(async ({ input }) => {
      return services.get().projectService.update(input.id, input.data);
    }),

  /** 프로젝트 삭제 */
  projectDelete: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return services.get().projectService.delete(input.id);
    }),

  // ========================================
  // Cycle Routes
  // ========================================

  /** 사이클 목록 조회 */
  cycleList: publicProcedure.query(async () => {
    return services.get().cycleService.findAll();
  }),

  /** 사이클 상세 조회 */
  cycleById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().cycleService.findById(input.id);
    }),

  /** 사이클 생성 */
  cycleCreate: authProcedure
    .input(createCycleSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().cycleService.create(input, userId);
    }),

  /** 사이클 수정 */
  cycleUpdate: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updateCycleSchema }))
    .mutation(async ({ input }) => {
      return services.get().cycleService.update(input.id, input.data);
    }),

  // ========================================
  // Label Routes
  // ========================================

  /** 라벨 목록 조회 */
  labelList: publicProcedure.query(async () => {
    return services.get().labelService.findAll();
  }),

  /** 라벨 생성 */
  labelCreate: authProcedure
    .input(createLabelSchema)
    .mutation(async ({ input }) => {
      return services.get().labelService.create(input);
    }),

  /** 라벨 삭제 */
  labelDelete: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return services.get().labelService.delete(input.id);
    }),

  // ========================================
  // Comment Routes
  // ========================================

  /** 태스크별 댓글 목록 조회 */
  commentList: publicProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().commentService.findByTaskId(input.taskId);
    }),

  /** 댓글 생성 */
  commentCreate: authProcedure
    .input(createCommentSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().commentService.create(input, userId);
    }),

  /** 댓글 수정 */
  commentUpdate: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updateCommentSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().commentService.update(input.id, input.data.content, userId);
    }),

  /** 댓글 삭제 */
  commentDelete: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().commentService.delete(input.id, userId);
    }),

  // ========================================
  // Activity Routes
  // ========================================

  /** 태스크별 활동 이력 조회 */
  activityList: publicProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().activityService.findByTaskId(input.taskId);
    }),
});

export type TaskRouter = typeof taskRouter;
