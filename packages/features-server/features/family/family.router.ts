import {
  router as createTRPCRouter,
  protectedProcedure,
  adminProcedure,
  createSingleServiceContainer,
} from '../../core/trpc';
import { z } from 'zod';
import type { FamilyService } from './service/family.service';
import {
  createGroupSchema,
  updateGroupSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  createChildSchema,
  updateChildSchema,
  assignTherapistSchema,
} from './dto';

// Service container (injected via NestJS Module.onModuleInit)
const { service: getFamilyService, inject: injectFamilyService } =
  createSingleServiceContainer<FamilyService>();

export { injectFamilyService };

export const familyRouter = createTRPCRouter({
  // ========== Protected: Group ==========

  createGroup: protectedProcedure
    .input(createGroupSchema)
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().createGroup(ctx.user!.id, input);
    }),

  getMyGroups: protectedProcedure.query(async ({ ctx }) => {
    return getFamilyService().getMyGroups(ctx.user!.id);
  }),

  getGroup: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getFamilyService().getGroup(ctx.user!.id, input.groupId);
    }),

  updateGroup: protectedProcedure
    .input(z.object({ groupId: z.string().uuid(), data: updateGroupSchema }))
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().updateGroup(
        ctx.user!.id,
        input.groupId,
        input.data,
      );
    }),

  deleteGroup: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().deleteGroup(ctx.user!.id, input.groupId);
    }),

  // ========== Protected: Member ==========

  inviteMember: protectedProcedure
    .input(inviteMemberSchema)
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().inviteMember(ctx.user!.id, input);
    }),

  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().acceptInvitation(ctx.user!.id, input.token);
    }),

  rejectInvitation: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().rejectInvitation(ctx.user!.id, input.token);
    }),

  updateMemberRole: protectedProcedure
    .input(updateMemberRoleSchema)
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().updateMemberRole(ctx.user!.id, input);
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        groupId: z.string().uuid(),
        memberId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().removeMember(
        ctx.user!.id,
        input.groupId,
        input.memberId,
      );
    }),

  leaveGroup: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().leaveGroup(ctx.user!.id, input.groupId);
    }),

  // ========== Protected: Child ==========

  createChild: protectedProcedure
    .input(createChildSchema)
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().createChild(ctx.user!.id, input);
    }),

  getChildren: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getFamilyService().getChildren(ctx.user!.id, input.groupId);
    }),

  getChild: protectedProcedure
    .input(z.object({ childId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getFamilyService().getChild(ctx.user!.id, input.childId);
    }),

  updateChild: protectedProcedure
    .input(updateChildSchema)
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().updateChild(ctx.user!.id, input);
    }),

  deactivateChild: protectedProcedure
    .input(z.object({ childId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().deactivateChild(ctx.user!.id, input.childId);
    }),

  reactivateChild: protectedProcedure
    .input(z.object({ childId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().reactivateChild(ctx.user!.id, input.childId);
    }),

  assignTherapist: protectedProcedure
    .input(assignTherapistSchema)
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().assignTherapist(ctx.user!.id, input);
    }),

  unassignTherapist: protectedProcedure
    .input(assignTherapistSchema)
    .mutation(async ({ ctx, input }) => {
      return getFamilyService().unassignTherapist(ctx.user!.id, input);
    }),

  getChildAssignments: protectedProcedure
    .input(z.object({ childId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getFamilyService().getChildAssignments(
        ctx.user!.id,
        input.childId,
      );
    }),

  // ========== Admin ==========

  admin: createTRPCRouter({
    listGroups: adminProcedure
      .input(
        z.object({
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
          search: z.string().optional(),
        }),
      )
      .query(({ input }) => {
        return getFamilyService().adminListGroups(input);
      }),

    getGroupDetail: adminProcedure
      .input(z.object({ groupId: z.string().uuid() }))
      .query(({ input }) => {
        return getFamilyService().adminGetGroupDetail(input.groupId);
      }),
  }),
});

export type FamilyRouter = typeof familyRouter;
