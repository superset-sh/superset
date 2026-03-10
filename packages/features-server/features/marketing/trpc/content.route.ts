/**
 * Marketing Content tRPC Router
 *
 * 마케팅 콘텐츠 CRUD + 소스 콘텐츠 변환 프로시저
 */
import { z } from "zod";
import { router, authProcedure, getAuthUserId } from "../../../core/trpc";
import {
  createContentSchema,
  updateContentSchema,
  createContentFromSourceSchema,
} from "../dto";
import { getMarketingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const contentRouter = router({
  /**
   * 콘텐츠 목록 조회 (필터 + 페이지네이션)
   */
  list: authProcedure
    .input(
      z.object({
        campaignId: z.string().uuid().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.findContents(
        { campaignId: input.campaignId, authorId: userId },
        input.page,
        input.limit,
      );
    }),

  /**
   * 콘텐츠 상세 조회
   */
  byId: authProcedure
    .input(z.string().uuid().describe("콘텐츠 ID"))
    .query(async ({ input }) => {
      const { marketingService } = getMarketingServices();
      return marketingService.findContentById(input);
    }),

  /**
   * 콘텐츠 생성 (에디터에서 직접 작성)
   */
  create: authProcedure
    .input(createContentSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.createContent(input, userId);
    }),

  /**
   * 소스 콘텐츠로부터 마케팅 콘텐츠 초안 생성
   */
  createFromSource: authProcedure
    .input(createContentFromSourceSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.createContentFromSource(
        input.sourceType,
        input.sourceId,
        userId,
        input.campaignId,
      );
    }),

  /**
   * 콘텐츠 수정
   */
  update: authProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: updateContentSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.updateContent(input.id, input.data, userId);
    }),

  /**
   * 콘텐츠 삭제
   */
  delete: authProcedure
    .input(z.string().uuid().describe("콘텐츠 ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.deleteContent(input, userId);
    }),
});

export type ContentRouterType = typeof contentRouter;
