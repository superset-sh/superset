import { z } from 'zod';
import { router as createTRPCRouter, adminProcedure, createSingleServiceContainer } from '../../core/trpc';
import { paginationSchema, idSchema } from '../_common';
import type { AuditLogService } from './service/audit-log.service';

// Service container (injected via NestJS onModuleInit)
const { service: getAuditLogService, inject: injectAuditLogService } =
  createSingleServiceContainer<AuditLogService>();

export { injectAuditLogService };

export const auditLogRouter = createTRPCRouter({
  listLogs: adminProcedure
    .input(
      paginationSchema.extend({
        userId: z.string().uuid().optional(),
        action: z.string().optional(),
        resourceType: z.string().optional(),
        startDate: z
          .string()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
        endDate: z
          .string()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
      }),
    )
    .query(async ({ input }) => {
      return getAuditLogService().listLogs(input);
    }),

  getLog: adminProcedure
    .input(idSchema)
    .query(async ({ input }) => {
      return getAuditLogService().getLog(input.id);
    }),
});

export type AuditLogRouter = typeof auditLogRouter;
