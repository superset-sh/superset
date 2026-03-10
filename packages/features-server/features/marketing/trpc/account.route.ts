/**
 * Marketing SNS Account tRPC Router
 *
 * SNS 계정 연결/해제 관리 프로시저
 */
import { z } from "zod";
import { router, authProcedure, getAuthUserId } from "../../../core/trpc";
import { connectAccountSchema } from "../dto";
import { getMarketingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const accountRouter = router({
  /**
   * 내 연결된 SNS 계정 목록 조회
   */
  list: authProcedure.query(async ({ ctx }) => {
    const userId = getAuthUserId(ctx);
    const { snsAccountService } = getMarketingServices();
    return snsAccountService.findAccounts(userId);
  }),

  /**
   * SNS 계정 연결 (OAuth 인증 코드 교환)
   */
  connect: authProcedure
    .input(connectAccountSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { snsAccountService } = getMarketingServices();
      return snsAccountService.connectAccount(input, userId);
    }),

  /**
   * SNS 계정 연결 해제
   */
  disconnect: authProcedure
    .input(z.string().uuid().describe("SNS 계정 ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { snsAccountService } = getMarketingServices();
      return snsAccountService.disconnectAccount(input, userId);
    }),
});

export type AccountRouterType = typeof accountRouter;
