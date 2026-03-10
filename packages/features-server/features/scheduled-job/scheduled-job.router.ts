import { z } from 'zod';
import { router as createTRPCRouter, adminProcedure, createServiceContainer } from '../../core/trpc';
import type { ScheduledJobService } from './service/scheduled-job.service';
import type { CronRunnerService } from './service/cron-runner.service';

// Service container (injected via NestJS onModuleInit)
const services = createServiceContainer<{
  scheduledJobService: ScheduledJobService;
  cronRunnerService: CronRunnerService;
}>();

export const injectScheduledJobServices = services.inject;

export const scheduledJobRouter = createTRPCRouter({
  listJobs: adminProcedure.query(async () => {
    return services.get().scheduledJobService.listJobs();
  }),

  getJobRuns: adminProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return services.get().scheduledJobService.getJobRuns(input.jobId, {
        page: input.page,
        limit: input.limit,
      });
    }),

  toggleJob: adminProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return services.get().scheduledJobService.toggleJob(input.jobId);
    }),

  runJobNow: adminProcedure
    .input(z.object({ jobKey: z.string() }))
    .mutation(async ({ input }) => {
      const runner = services.get().cronRunnerService;
      switch (input.jobKey) {
        case 'credit_monthly_renewal':
          await runner.creditMonthlyRenewal();
          break;
        case 'marketing_scheduled_publish':
          await runner.marketingScheduledPublish();
          break;
        case 'data_cleanup':
          await runner.dataCleanup();
          break;
        case 'analytics_daily_aggregate':
          await runner.analyticsDailyAggregate();
          break;
        default:
          throw new Error(`Unknown job: ${input.jobKey}`);
      }
      return { success: true };
    }),
});

export type ScheduledJobRouter = typeof scheduledJobRouter;
