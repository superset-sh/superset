import {
  router as createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  createSingleServiceContainer,
} from '../../core/trpc';
import { z } from 'zod';
import type { ProfileService } from './service/profile.service';
import { updateProfileSchema, createTermSchema, updateTermSchema, withdrawInputSchema } from './dto';

// Service container (injected via NestJS Module.onModuleInit)
const { service: getProfileService, inject: injectProfileService } =
  createSingleServiceContainer<ProfileService>();

export { injectProfileService };

export const profileRouter = createTRPCRouter({
  // ========== Protected Procedures (Auth) ==========

  me: protectedProcedure.query(async ({ ctx }) => {
    return getProfileService().getProfile(ctx.user!.id);
  }),

  update: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      return getProfileService().updateProfile(ctx.user!.id, input);
    }),

  checkWithdrawable: protectedProcedure.query(async ({ ctx }) => {
    return getProfileService().checkWithdrawable(ctx.user!.id);
  }),

  withdraw: protectedProcedure
    .input(withdrawInputSchema)
    .mutation(async ({ ctx, input }) => {
      return getProfileService().withdraw(ctx.user!.id, input);
    }),

  // ========== Public Procedures ==========

  termsList: publicProcedure.query(async () => {
    return getProfileService().listTerms(true);
  }),

  // ========== Admin Procedures ==========

  admin: createTRPCRouter({
    list: adminProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        marketingConsent: z.enum(['agreed', 'not_agreed']).optional(),
      }))
      .query(({ input }) => {
        return getProfileService().listAll(input);
      }),

    updateRole: adminProcedure
      .input(z.object({
        targetId: z.string().uuid(),
        role: z.enum(["admin", "editor", "guest"]),
      }))
      .mutation(({ input, ctx }) => {
        return getProfileService().updateRole(input.targetId, input.role, ctx.user!.id);
      }),

    deactivate: adminProcedure
      .input(z.object({ targetId: z.string().uuid() }))
      .mutation(({ input, ctx }) => {
        return getProfileService().deactivate(input.targetId, ctx.user!.id);
      }),

    reactivate: adminProcedure
      .input(z.object({ targetId: z.string().uuid() }))
      .mutation(({ input }) => {
        return getProfileService().reactivate(input.targetId);
      }),

    // ========== Terms Admin Procedures ==========

    termsList: adminProcedure.query(async () => {
      return getProfileService().listTerms(false);
    }),

    termsCreate: adminProcedure
      .input(createTermSchema)
      .mutation(async ({ input }) => {
        return getProfileService().createTerm(input);
      }),

    termsUpdate: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        data: updateTermSchema,
      }))
      .mutation(async ({ input }) => {
        return getProfileService().updateTerm(input.id, input.data);
      }),

    termsDelete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        return getProfileService().deleteTerm(input.id);
      }),

    withdrawalReasons: adminProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        reasonType: z.string().optional(),
      }))
      .query(({ input }) => {
        return getProfileService().adminWithdrawalReasons(input);
      }),
  }),
});

export type ProfileRouter = typeof profileRouter;
