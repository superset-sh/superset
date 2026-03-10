import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router as createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure, createServiceContainer } from '../../core/trpc';
import type { PaymentService } from './service/payment.service';
import type { PaymentProviderFactory } from './provider/payment-provider.factory';
import type { PlanService } from './service/plan.service';
import type { CreditService } from './service/credit.service';
import type { ModelPricingService } from './service/model-pricing.service';
import { eq } from 'drizzle-orm';
import { paymentCreditBalances } from '@superbuilder/drizzle';
import {
  createCheckoutSchema,
  updateSubscriptionSchema,
  cancelSubscriptionSchema,
  validateLicenseSchema,
  refundOrderSchema,
  refundSubscriptionSchema,
  subscriptionQuerySchema,
  orderQuerySchema,
  licenseQuerySchema,
  requestRefundSchema,
  processRefundRequestSchema,
} from './dto';

// Service container (injected via NestJS onModuleInit)
const services = createServiceContainer<{
  paymentService: PaymentService;
  providerFactory: PaymentProviderFactory;
  planService: PlanService;
  creditService: CreditService;
  modelPricingService: ModelPricingService;
}>();

export const injectPaymentServices = services.inject;

export const paymentRouter = createTRPCRouter({
  // ========== Public Procedures ==========

  getActiveProducts: publicProcedure.query(async () => {
    return services.get().paymentService.getActiveProducts();
  }),

  createCheckout: publicProcedure
    .input(createCheckoutSchema)
    .mutation(async ({ ctx, input }) => {

      const userId = ctx.user?.id;
      return services.get().paymentService.createCheckout(input, userId);
    }),

  // 활성 플랜 목록 조회
  getPlans: publicProcedure.query(async () => {
    return services.get().planService.getPlans();
  }),

  // ========== Protected Procedures (Auth) ==========

  getMySubscription: protectedProcedure.query(async ({ ctx }) => {
    
    return services.get().paymentService.getUserSubscription(ctx.user!.id);
  }),

  updateSubscription: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: updateSubscriptionSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      
      

      const subscription = await services.get().paymentService.getUserSubscription(ctx.user!.id);
      if (!subscription || subscription.externalId !== input.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found or unauthorized',
        });
      }

      return services.get().providerFactory.getActive().updateSubscription(input.id, input.data);
    }),

  cancelSubscription: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: cancelSubscriptionSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const subscription = await services.get().paymentService.getUserSubscription(ctx.user!.id);
      if (!subscription || subscription.externalId !== input.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found or unauthorized',
        });
      }

      // 이미 취소/만료된 구독은 재취소 불가
      if (subscription.status === 'cancelled' || subscription.status === 'expired') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '이미 취소되었거나 만료된 구독입니다',
        });
      }

      return services.get().providerFactory.getActive().cancelSubscription(input.id);
    }),

  // 내 주문 내역 조회 (결제 내역)
  getMyOrders: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return services.get().paymentService.getOrders({
        ...input,
        status: 'all',
        userId: ctx.user!.id,
      });
    }),

  checkRefundable: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return services.get().paymentService.checkRefundable(ctx.user!.id, input.orderId);
    }),

  requestRefund: protectedProcedure
    .input(requestRefundSchema)
    .mutation(async ({ ctx, input }) => {
      return services.get().paymentService.requestRefund(ctx.user!.id, input);
    }),

  getMyRefundRequests: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return services.get().paymentService.getMyRefundRequests(ctx.user!.id, input);
    }),

  getMyLicenses: protectedProcedure.query(async ({ ctx }) => {

    return services.get().paymentService.getUserLicenses(ctx.user!.id);
  }),

  validateLicense: protectedProcedure
    .input(validateLicenseSchema)
    .mutation(async ({ input }) => {

      return services.get().paymentService.validateLicense(input.licenseKey);
    }),

  // 내 크레딧 잔액 조회
  getMyBalance: protectedProcedure.query(async ({ ctx }) => {
    return services.get().creditService.getBalance(ctx.user!.id);
  }),

  // 내 크레딧 트랜잭션 내역 조회
  getMyTransactions: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return services.get().creditService.getTransactions(ctx.user!.id, input);
    }),

  // 플랜 변경 (업그레이드/다운그레이드)
  changePlan: protectedProcedure
    .input(z.object({ targetPlanId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const { paymentService, planService, providerFactory } = services.get();

      // 1. 현재 구독 확인
      const subscription = await paymentService.getUserSubscription(userId);
      if (!subscription || !subscription.externalId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '활성 구독이 없습니다' });
      }

      // 구독이 활성 상태인지 확인
      if (subscription.status !== 'active' && subscription.status !== 'on_trial') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '활성 상태의 구독만 플랜을 변경할 수 있습니다' });
      }

      // 2. 타겟 플랜의 provider variant ID 확인
      const targetPlan = await planService.getPlanById(input.targetPlanId);

      // 동일 플랜 변경 방지: 현재 구독의 variant와 비교
      // (subscription에는 variant_id가 직접 없으므로 plan 매칭으로 비교)
      if (targetPlan.tier === 'free' || targetPlan.tier === 'enterprise') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Free/Enterprise 플랜으로는 직접 변경할 수 없습니다' });
      }

      if (!targetPlan.providerVariantId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '해당 플랜으로 변경할 수 없습니다 (결제 연동 미설정)' });
      }

      // 3. Provider API로 variant 변경 (프로레이션 자동 적용)
      await providerFactory.getActive().updateSubscription(subscription.externalId, {
        variant_id: targetPlan.providerVariantId,
      });

      // 4. 크레딧 할당 업데이트
      await planService.assignPlanToUser(userId, targetPlan.id);

      return { success: true, planName: targetPlan.name };
    }),

  // 자동 충전 설정 업데이트
  updateAutoRecharge: protectedProcedure
    .input(
      z.object({
        autoRecharge: z.boolean(),
        autoRechargeThreshold: z.number().int().min(0).optional(),
        autoRechargeAmount: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 잔액 레코드가 존재하는지 확인 (없으면 자동 생성)
      await services.get().creditService.getBalance(ctx.user!.id);

      const [updated] = await ctx.db
        .update(paymentCreditBalances)
        .set({
          autoRecharge: input.autoRecharge,
          autoRechargeThreshold: input.autoRechargeThreshold ?? null,
          autoRechargeAmount: input.autoRechargeAmount ?? null,
        })
        .where(eq(paymentCreditBalances.userId, ctx.user!.id))
        .returning();

      return updated;
    }),

  // ========== Admin Procedures ==========

  admin: createTRPCRouter({
    syncProducts: adminProcedure.mutation(async () => {

      await services.get().paymentService.syncProducts();
      return { success: true, message: 'Products synced successfully' };
    }),

    getSubscriptions: adminProcedure.input(subscriptionQuerySchema).query(async ({ input }) => {

      return services.get().paymentService.getSubscriptions(input);
    }),

    getSubscriptionStats: adminProcedure.query(async () => {

      return services.get().paymentService.getSubscriptionStats();
    }),

    refundSubscription: adminProcedure
      .input(
        z.object({
          subscriptionId: z.string(),
          data: refundSubscriptionSchema,
        }),
      )
      .mutation(async ({ input }) => {

        return services.get().paymentService.refundSubscription(input.subscriptionId, input.data.reason);
      }),

    getOrders: adminProcedure.input(orderQuerySchema).query(async ({ input }) => {

      return services.get().paymentService.getOrders(input);
    }),

    refundOrder: adminProcedure
      .input(
        z.object({
          orderId: z.string(),
          data: refundOrderSchema,
        }),
      )
      .mutation(async ({ input }) => {

        return services.get().paymentService.refundOrder(input.orderId, input.data.amount, input.data.reason);
      }),

    getLicenses: adminProcedure.input(licenseQuerySchema).query(async ({ input }) => {

      return services.get().paymentService.getLicenses(input);
    }),

    getRefundRequests: adminProcedure.query(async () => {

      return services.get().paymentService.getRefundRequests();
    }),

    processRefundRequest: adminProcedure
      .input(processRefundRequestSchema)
      .mutation(async ({ ctx, input }) => {
        return services.get().paymentService.adminProcessRefundRequest(ctx.user!.id, input);
      }),

    // ========== Plan Admin ==========

    // Provider → Plans 동기화
    syncPlans: adminProcedure.mutation(async () => {
      const result = await services.get().planService.syncPlansFromProvider(services.get().providerFactory.getActive());
      return { success: true, ...result };
    }),

    // 전체 플랜 목록 조회 (비활성 포함)
    getAllPlans: adminProcedure.query(async () => {
      return services.get().planService.getAllPlans();
    }),

    // 플랜 생성
    createPlan: adminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          slug: z.string().min(1),
          description: z.string().optional(),
          tier: z.enum(['free', 'pro', 'team', 'enterprise']),
          monthlyCredits: z.number().int().min(0),
          price: z.number().int().min(0).default(0),
          currency: z.string().default('USD'),
          interval: z.string().default('month'),
          providerProductId: z.string().optional(),
          providerVariantId: z.string().optional(),
          features: z.array(z.string()).optional(),
          isActive: z.boolean().default(true),
          sortOrder: z.number().int().default(0),
        }),
      )
      .mutation(async ({ input }) => {
        return services.get().planService.createPlan(input);
      }),

    // 플랜 수정
    updatePlan: adminProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          data: z.object({
            name: z.string().min(1).optional(),
            slug: z.string().min(1).optional(),
            description: z.string().optional(),
            tier: z.enum(['free', 'pro', 'team', 'enterprise']).optional(),
            monthlyCredits: z.number().int().min(0).optional(),
            price: z.number().int().min(0).optional(),
            currency: z.string().optional(),
            interval: z.string().optional(),
            providerProductId: z.string().optional(),
            providerVariantId: z.string().optional(),
            features: z.array(z.string()).optional(),
            isPerSeat: z.boolean().optional(),
            isActive: z.boolean().optional(),
            sortOrder: z.number().int().optional(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        return services.get().planService.updatePlan(input.id, input.data);
      }),

    // DB → Provider 동기화 (Push)
    pushPlansToProvider: adminProcedure.mutation(async () => {
      const result = await services.get().planService.pushPlansToProvider(services.get().providerFactory.getActive());
      return { success: true, ...result };
    }),

    // 사용자에게 플랜 할당
    assignPlan: adminProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          planId: z.string().uuid(),
        }),
      )
      .mutation(async ({ input }) => {
        return services.get().planService.assignPlanToUser(input.userId, input.planId);
      }),

    // ========== Credit Admin ==========

    // 특정 사용자 크레딧 잔액 조회
    getUserCredits: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ input }) => {
        return services.get().creditService.getBalance(input.userId);
      }),

    // 특정 사용자 트랜잭션 내역 조회
    getUserTransactions: adminProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
        }),
      )
      .query(async ({ input }) => {
        const { userId, page, limit } = input;
        return services.get().creditService.getTransactions(userId, { page, limit });
      }),

    // 관리자 수동 크레딧 조정
    adjustCredits: adminProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          amount: z.number().int(),
          reason: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        return services.get().creditService.adjustBalance(input.userId, input.amount, input.reason);
      }),

    // ========== Subscribers Admin ==========

    // 구독자 목록 조회 (profiles + subscriptions JOIN)
    getSubscribers: adminProcedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
          search: z.string().optional(),
          status: z.string().optional(),
          planName: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        return services.get().paymentService.getSubscribers(input);
      }),

    // ========== Model Pricing Admin ==========

    // 모델 가격 목록 조회
    getModelPricing: adminProcedure.query(async () => {
      return services.get().modelPricingService.getPricingList();
    }),

    // 모델 가격 upsert
    upsertModelPricing: adminProcedure
      .input(
        z.object({
          modelId: z.string().min(1),
          provider: z.string().min(1),
          displayName: z.string().min(1),
          inputCreditsPerKToken: z.number().int().min(0),
          outputCreditsPerKToken: z.number().int().min(0),
          isActive: z.boolean().default(true),
        }),
      )
      .mutation(async ({ input }) => {
        return services.get().modelPricingService.upsertPricing(input);
      }),
  }),
});

export type PaymentRouter = typeof paymentRouter;
