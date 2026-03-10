/**
 * AI tRPC Router
 *
 * 범용 AI 엔드포인트 — 어떤 feature에서든 호출 가능.
 * 그래프/보드 등 특정 도메인에 의존하지 않고 context를 직접 받는다.
 */
import { z } from "zod";
import { router, authProcedure, createSingleServiceContainer } from "../../../core/trpc";
import type { LLMService } from "../service/llm.service";

// ============================================================================
// Zod Schemas
// ============================================================================

const suggestTopicsSchema = z.object({
  contextTitle: z.string().min(1).max(300),
  contextDescription: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        title: z.string(),
        itemType: z.string(),
        contentPreview: z.string(),
      })
    )
    .max(50),
  nodeTypes: z.array(z.string()).max(10).optional(),
});

const generateDraftSchema = z.object({
  contextTitle: z.string().min(1).max(300),
  topicTitle: z.string().min(1).max(300),
  topicDescription: z.string().max(2000),
  nodeType: z.string().min(1).max(50),
  existingTitles: z.array(z.string()).max(50),
});

// ============================================================================
// Service Container (injected via NestJS Module.onModuleInit)
// ============================================================================

const { service: getLLMService, inject: injectAIService } =
  createSingleServiceContainer<LLMService>();

export { injectAIService };

// ============================================================================
// Router
// ============================================================================

export const aiRouter = router({
  /** AI 주제 추천 */
  suggestTopics: authProcedure
    .input(suggestTopicsSchema)
    .mutation(async ({ input }) => {
      return getLLMService().suggestTopics(input);
    }),

  /** AI 초안 생성 */
  generateDraft: authProcedure
    .input(generateDraftSchema)
    .mutation(async ({ input }) => {
      return getLLMService().generateDraft(input);
    }),
});

export type AIRouter = typeof aiRouter;
