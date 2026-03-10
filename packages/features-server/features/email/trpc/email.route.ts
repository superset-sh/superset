import { NotFoundException } from '@nestjs/common';
import { router, adminProcedure, createSingleServiceContainer } from '../../../core/trpc';
import { z } from 'zod';
import { queryLogsSchema } from '../dto';
import type { IEmailService } from '../types';

// Service container (injected via NestJS Module.onModuleInit)
const { service: getEmailService, inject: injectEmailService } =
  createSingleServiceContainer<IEmailService>();

export { injectEmailService };

/**
 * Email tRPC Router
 */
export const emailRouter = router({
  /**
   * 이메일 로그 목록 조회 (Admin only)
   */
  getLogs: adminProcedure.input(queryLogsSchema).query(async ({ input }) => {
    return getEmailService().getEmailLogs(input);
  }),

  /**
   * 이메일 로그 상세 조회 (Admin only)
   */
  getLog: adminProcedure.input(z.object({ logId: z.string().uuid() })).query(async ({ input }) => {
    const log = await getEmailService().getEmailLog(input.logId);

    if (!log) {
      throw new NotFoundException("이메일 로그를 찾을 수 없습니다");
    }

    return log;
  }),

  /**
   * 이메일 재발송 (Admin only)
   */
  resend: adminProcedure
    .input(z.object({ logId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const log = await getEmailService().resendEmail(input.logId);
      return { success: true, log };
    }),

  /**
   * 템플릿 미리보기 (Admin only)
   */
  previewTemplate: adminProcedure
    .input(
      z.object({
        templateType: z.enum([
          'welcome',
          'email-verification',
          'password-reset',
          'password-changed',
          'notification',
        ] as const),
        variables: z.record(z.string(), z.any()),
      }),
    )
    .query(async () => {
      const html = '';
      return { html };
    }),
});

export type EmailRouter = typeof emailRouter;
