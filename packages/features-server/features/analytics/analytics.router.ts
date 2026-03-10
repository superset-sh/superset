import { z } from 'zod';
import { router as createTRPCRouter, adminProcedure, createSingleServiceContainer } from '../../core/trpc';
import type { AnalyticsService } from './service/analytics.service';

// Service container (injected via NestJS onModuleInit)
const { service: getAnalyticsService, inject: injectAnalyticsService } =
  createSingleServiceContainer<AnalyticsService>();

export { injectAnalyticsService };

export const analyticsRouter = createTRPCRouter({
  getOverview: adminProcedure.query(async () => {
    return getAnalyticsService().getOverview();
  }),

  getTrend: adminProcedure
    .input(
      z.object({
        metricKey: z.string(),
        days: z.number().min(1).max(365).default(30),
      }),
    )
    .query(async ({ input }) => {
      return getAnalyticsService().getTrend(input);
    }),

  getDistribution: adminProcedure.query(async () => {
    return getAnalyticsService().getDistribution();
  }),
});

export type AnalyticsRouter = typeof analyticsRouter;
