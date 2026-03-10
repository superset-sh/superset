import { adminProcedure, protectedProcedure, router } from "../../core/trpc";
import { z } from "zod";
import {
  applyCouponSchema,
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
} from "./dto";
import { CouponService } from "./service";

let couponService: CouponService;
export const setCouponService = (service: CouponService) => {
  couponService = service;
};

export const couponRouter = router({
  // Admin
  admin: router({
    create: adminProcedure.input(createCouponSchema).mutation(async ({ input, ctx }) => {
      return couponService.create(input, ctx.user.id);
    }),

    list: adminProcedure
      .input(
        z
          .object({
            page: z.number().int().min(1).optional(),
            limit: z.number().int().min(1).max(100).optional(),
          })
          .optional(),
      )
      .query(async ({ input }) => {
        return couponService.list(input?.page, input?.limit);
      }),

    getById: adminProcedure.input(z.string().uuid()).query(async ({ input }) => {
      return couponService.getByIdWithRedemptions(input);
    }),

    update: adminProcedure
      .input(z.object({ id: z.string().uuid(), data: updateCouponSchema }))
      .mutation(async ({ input }) => {
        return couponService.update(input.id, input.data);
      }),

    deactivate: adminProcedure.input(z.string().uuid()).mutation(async ({ input }) => {
      return couponService.deactivate(input);
    }),

    delete: adminProcedure.input(z.string().uuid()).mutation(async ({ input }) => {
      return couponService.softDelete(input);
    }),
  }),

  // User
  validate: protectedProcedure.input(validateCouponSchema).query(async ({ input, ctx }) => {
    return couponService.validate(input, ctx.user.id);
  }),

  applyCoupon: protectedProcedure.input(applyCouponSchema).mutation(async ({ input, ctx }) => {
    return couponService.apply(input, ctx.user.id);
  }),

  myRedemption: protectedProcedure.query(async ({ ctx }) => {
    return couponService.getMyRedemption(ctx.user.id);
  }),

  cancel: protectedProcedure.input(z.string().uuid()).mutation(async ({ input, ctx }) => {
    return couponService.cancel(input, ctx.user.id);
  }),
});

export type CouponRouter = typeof couponRouter;
