/**
 * Board tRPC Router
 */
import { z } from "zod";
import { router, publicProcedure, authProcedure, adminProcedure, getAuthUserId, createServiceContainer } from "../../../core/trpc";
import type { BoardService } from "../service/board.service";
import type { PostService } from "../service/post.service";

// Zod schemas
const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  type: z.enum(["general", "gallery", "qna"]).optional(),
  description: z.string().optional(),
  settings: z.object({
    allowAnonymous: z.boolean().optional(),
    allowComments: z.boolean().optional(),
    allowAttachments: z.boolean().optional(),
    maxAttachments: z.number().optional(),
    allowedFileTypes: z.array(z.string()).optional(),
    postsPerPage: z.number().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
  order: z.number().optional(),
});

const updateBoardSchema = createBoardSchema.partial();

const createPostSchema = z.object({
  boardId: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  status: z.enum(["draft", "published", "hidden"]).optional(),
  isPinned: z.boolean().optional(),
  isNotice: z.boolean().optional(),
});

const updatePostSchema = createPostSchema.omit({ boardId: true }).partial();

// Service container (injected via NestJS onModuleInit)
const services = createServiceContainer<{
  boardService: BoardService;
  postService: PostService;
}>();

export const injectBoardServices = services.inject;

export const boardRouter = router({
  // ========================================
  // Board Routes
  // ========================================

  /** 게시판 목록 조회 */
  list: publicProcedure
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      return services.get().boardService.findAll(input?.includeInactive ?? false);
    }),

  /** Slug로 게시판 조회 */
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return services.get().boardService.findBySlug(input.slug);
    }),

  /** ID로 게시판 조회 */
  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().boardService.findById(input.id);
    }),

  /** 게시판 생성 (Admin) */
  create: adminProcedure
    .input(createBoardSchema)
    .mutation(async ({ input }) => {
      return services.get().boardService.create(input);
    }),

  /** 게시판 수정 (Admin) */
  update: adminProcedure
    .input(z.object({ id: z.string().uuid(), data: updateBoardSchema }))
    .mutation(async ({ input }) => {
      return services.get().boardService.update(input.id, input.data);
    }),

  /** 게시판 삭제 (Admin) */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await services.get().boardService.delete(input.id);
      return { success: true };
    }),

  // ========================================
  // Post Routes
  // ========================================

  /** 게시물 목록 조회 */
  posts: publicProcedure
    .input(z.object({
      boardId: z.string().uuid(),
      page: z.number().min(1).optional(),
      limit: z.number().min(1).max(100).optional(),
    }))
    .query(async ({ input }) => {
      return services.get().postService.findByBoardId(input.boardId, {
        page: input.page,
        limit: input.limit,
      });
    }),

  /** 게시물 상세 조회 */
  post: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const post = await services.get().postService.findById(input.id);
      if (post) {
        // 조회수 증가 (비동기로 처리)
        services.get().postService.incrementViewCount(input.id).catch(() => {});
      }
      return post;
    }),

  /** 게시물 생성 */
  createPost: authProcedure
    .input(createPostSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().postService.create(input, userId);
    }),

  /** 게시물 수정 */
  updatePost: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updatePostSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().postService.update(input.id, input.data, userId);
    }),

  /** 게시물 삭제 */
  deletePost: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      await services.get().postService.delete(input.id, userId);
      return { success: true };
    }),
});

export type BoardRouter = typeof boardRouter;
