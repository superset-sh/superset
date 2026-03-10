import { z } from 'zod';
import {
  router as createTRPCRouter,
  protectedProcedure,
  adminProcedure,
  createSingleServiceContainer,
} from '../../core/trpc';
import type { NotificationService } from './service/notification.service';
import {
  notificationQuerySchema,
  updateSettingsSchema,
  broadcastSchema,
} from './dto';

// Service container (injected via NestJS Module.onModuleInit)
const { service: getNotificationService, inject: injectNotificationService } =
  createSingleServiceContainer<NotificationService>();

export { injectNotificationService };

export const notificationRouter = createTRPCRouter({
  // ========== Protected Procedures (Auth) ==========

  list: protectedProcedure
    .input(notificationQuerySchema.optional())
    .query(async ({ ctx, input }) => {
      return getNotificationService().list(ctx.user!.id, input);
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return getNotificationService().getUnreadCount(ctx.user!.id);
  }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getNotificationService().markAsRead(ctx.user!.id, input.id);
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    return getNotificationService().markAllAsRead(ctx.user!.id);
  }),

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    return getNotificationService().getSettings(ctx.user!.id);
  }),

  updateSettings: protectedProcedure
    .input(updateSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return getNotificationService().updateSettings(ctx.user!.id, input);
    }),

  // ========== Admin Procedures ==========

  admin: createTRPCRouter({
    broadcast: adminProcedure.input(broadcastSchema).mutation(async ({ input }) => {
      return getNotificationService().broadcast(input);
    }),

    getStats: adminProcedure.query(async () => {
      return getNotificationService().getStats();
    }),
  }),
});

export type NotificationRouter = typeof notificationRouter;
