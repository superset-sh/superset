import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authProcedure, adminProcedure } from "./trpc";
import { agentService } from "../services/agent.service";
import { threadService } from "../services/thread.service";
import { messageService } from "../services/message.service";
import { usageService } from "../services/usage.service";

// ============================================================================
// Agent Router
// ============================================================================

const agentRouter = router({
  /** 활성 에이전트 목록 */
  list: publicProcedure.query(() => agentService.listActive()),

  /** ID로 조회 */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const agent = await agentService.getById(input.id);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND" });
      return agent;
    }),

  /** slug로 조회 */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const agent = await agentService.getBySlug(input.slug);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND" });
      return agent;
    }),

  /** 에이전트 생성 (관리자) */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(100),
        description: z.string().optional(),
        avatar: z.string().optional(),
        systemPrompt: z.string().min(1),
        modelPreference: z
          .object({
            fast: z.string().optional(),
            default: z.string().optional(),
            reasoning: z.string().optional(),
            longContext: z.string().optional(),
          })
          .optional(),
        enabledTools: z.array(z.string()).optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxSteps: z.number().int().min(1).max(50).optional(),
        isDefault: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return agentService.create({
        ...input,
        createdById: ctx.user.id,
      });
    }),

  /** 에이전트 수정 (관리자) */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z.object({
          name: z.string().min(1).max(100).optional(),
          slug: z.string().min(1).max(100).optional(),
          description: z.string().optional(),
          avatar: z.string().optional(),
          systemPrompt: z.string().min(1).optional(),
          modelPreference: z
            .object({
              fast: z.string().optional(),
              default: z.string().optional(),
              reasoning: z.string().optional(),
              longContext: z.string().optional(),
            })
            .optional(),
          enabledTools: z.array(z.string()).optional(),
          temperature: z.number().min(0).max(2).optional(),
          maxSteps: z.number().int().min(1).max(50).optional(),
          isDefault: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }),
      }),
    )
    .mutation(({ input }) => agentService.update(input.id, input.data)),

  /** 에이전트 비활성화 (관리자) */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) => agentService.deactivate(input.id)),
});

// ============================================================================
// Thread Router
// ============================================================================

const threadRouter = router({
  /** 내 스레드 목록 */
  list: authProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      threadService.listByUser(ctx.user.id, {
        limit: input?.limit,
        offset: input?.offset,
      }),
    ),

  /** 스레드 상세 */
  getById: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const thread = await threadService.getById(input.id);
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });
      if (thread.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return thread;
    }),

  /** 스레드 생성 */
  create: authProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        title: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      threadService.create({
        agentId: input.agentId,
        userId: ctx.user.id,
        title: input.title,
      }),
    ),

  /** 스레드 업데이트 */
  update: authProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z.object({
          title: z.string().optional(),
          isPinned: z.boolean().optional(),
          isArchived: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const thread = await threadService.getById(input.id);
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });
      if (thread.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return threadService.update(input.id, input.data);
    }),

  /** 스레드 삭제 */
  delete: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const thread = await threadService.getById(input.id);
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });
      if (thread.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return threadService.delete(input.id);
    }),
});

// ============================================================================
// Message Router
// ============================================================================

const messageRouter = router({
  /** 스레드 내 메시지 목록 (커서 기반) */
  list: authProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(({ input }) =>
      messageService.listByThread(input.threadId, {
        limit: input.limit,
        cursor: input.cursor,
      }),
    ),
});

// ============================================================================
// Usage Router (관리자)
// ============================================================================

const daysInput = z
  .object({ days: z.number().int().min(1).max(90).optional() })
  .optional();

const usageRouter = router({
  /** 사용량 요약 통계 */
  summary: adminProcedure
    .input(daysInput)
    .query(({ input }) => usageService.summary(input?.days)),

  /** 모델별 사용량 */
  byModel: adminProcedure
    .input(daysInput)
    .query(({ input }) => usageService.byModel(input?.days)),

  /** 에이전트별 사용량 */
  byAgent: adminProcedure
    .input(daysInput)
    .query(({ input }) => usageService.byAgent(input?.days)),
});

// ============================================================================
// App Router
// ============================================================================

export const agentAppRouter = router({
  agents: agentRouter,
  threads: threadRouter,
  messages: messageRouter,
  usage: usageRouter,
});

export type AgentAppRouter = typeof agentAppRouter;
