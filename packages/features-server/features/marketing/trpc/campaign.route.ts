/**
 * Marketing Campaign tRPC Router
 *
 * 캠페인 CRUD 프로시저
 */
import { z } from "zod";
import { router, authProcedure, getAuthUserId } from "../../../core/trpc";
import { createCampaignSchema, updateCampaignSchema } from "../dto";
import { getMarketingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const campaignRouter = router({
  /**
   * 내 캠페인 목록 조회 (페이지네이션)
   */
  list: authProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.findCampaigns(userId, input.page, input.limit);
    }),

  /**
   * 캠페인 상세 조회
   */
  byId: authProcedure
    .input(z.string().uuid().describe("캠페인 ID"))
    .query(async ({ input }) => {
      const { marketingService } = getMarketingServices();
      return marketingService.findCampaignById(input);
    }),

  /**
   * 캠페인 생성
   */
  create: authProcedure
    .input(createCampaignSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.createCampaign(input, userId);
    }),

  /**
   * 캠페인 수정
   */
  update: authProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: updateCampaignSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.updateCampaign(input.id, input.data, userId);
    }),

  /**
   * 캠페인 삭제
   */
  delete: authProcedure
    .input(z.string().uuid().describe("캠페인 ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { marketingService } = getMarketingServices();
      return marketingService.deleteCampaign(input, userId);
    }),
});

export type CampaignRouterType = typeof campaignRouter;
