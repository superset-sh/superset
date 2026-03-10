import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDrizzle } from '@superbuilder/drizzle';
import type { DrizzleDB } from '@superbuilder/drizzle';
import { eq, and, desc, count, ilike, or } from 'drizzle-orm';
import { products, subscriptions, orders, licenses, webhookEvents, profiles, paymentPlans, refundRequests } from '@superbuilder/drizzle';
import { buildPaginatedResult } from '../../../shared/utils/offset-pagination';
import { createLogger } from '../../../core/logger';
import { PaymentProviderFactory } from '../provider/payment-provider.factory';
import type {
  CreateCheckoutInput,
  SubscriptionQueryInput,
  OrderQueryInput,
  LicenseQueryInput,
  RequestRefundInput,
} from '../dto';
import type {
  SubscriptionWithProduct,
  SubscriptionStats,
} from '../types';
import type { NormalizedCheckoutInput } from '../types/normalized.types';

const logger = createLogger('payment');

@Injectable()
export class PaymentService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  // ========== Products ==========

  /**
   * 결제 프로바이더 제품 동기화
   */
  async syncProducts(): Promise<void> {
    const provider = this.providerFactory.getActive();
    const providerName = provider.providerName;
    const productList = await provider.getProducts();

    for (const item of productList) {
      const variants = await provider.getVariants(item.externalId);
      const firstVariant = variants[0];

      await this.db
        .insert(products)
        .values({
          externalId: item.externalId,
          provider: providerName,
          storeId: provider.getStoreId(),
          name: item.name,
          description: item.description,
          status: item.status,
          price: item.price,
          currency: item.currency,
          isSubscription: firstVariant?.isSubscription ?? false,
          subscriptionInterval: firstVariant?.interval ?? null,
          subscriptionIntervalCount: firstVariant?.intervalCount ?? null,
          hasLicense: firstVariant?.hasLicenseKeys ?? false,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [products.externalId, products.provider],
          set: {
            name: item.name,
            description: item.description,
            status: item.status,
            price: item.price,
            lastSyncedAt: new Date(),
          },
        });
    }

    logger.info('Products synced', {
      'payment.product_count': productList.length,
      'payment.provider': providerName,
    });
  }

  /**
   * 활성 제품 목록 조회
   */
  async getActiveProducts() {
    return this.db.query.products.findMany({
      where: and(eq(products.isActive, true), eq(products.status, 'published')),
      orderBy: [products.createdAt],
    });
  }

  // ========== Checkout ==========

  /**
   * Checkout 생성
   */
  async createCheckout(input: CreateCheckoutInput, userId?: string) {
    const provider = this.providerFactory.getActive();

    const checkoutData: NormalizedCheckoutInput = {
      storeOrOrgId: provider.getStoreId(),
      variantOrProductId: input.variantId,
      customPrice: input.customPrice,
      email: input.email,
      name: input.name,
      discountCode: input.discountCode,
      customData: {
        user_id: userId ?? '',
        ...input.customData,
      },
      redirectUrl: input.redirectUrl,
      testMode: process.env.NODE_ENV !== 'production',
    };

    const result = await provider.createCheckout(checkoutData);
    return {
      checkoutUrl: result.checkoutUrl,
    };
  }

  // ========== Subscriptions ==========

  /**
   * 사용자 구독 조회
   */
  async getUserSubscription(userId: string): Promise<SubscriptionWithProduct | null> {
    const subscription = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, userId),
      orderBy: [desc(subscriptions.createdAt)],
    });

    if (!subscription) return null;

    // 1. productId로 제품 정보 조회
    let productInfo: SubscriptionWithProduct['product'] | undefined;

    if (subscription.productId) {
      const product = await this.db.query.products.findFirst({
        where: eq(products.id, subscription.productId),
      });

      if (product) {
        productInfo = {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency,
        };
      }
    }

    // 2. product 없으면 paymentPlans에서 매칭 (가격/통화/구간 기반)
    if (!productInfo) {
      const plan = await this.db.query.paymentPlans.findFirst({
        where: and(
          eq(paymentPlans.price, subscription.price),
          eq(paymentPlans.currency, subscription.currency),
          eq(paymentPlans.interval, subscription.interval),
          eq(paymentPlans.isActive, true),
        ),
      });

      if (plan) {
        productInfo = {
          id: plan.id,
          name: plan.name,
          description: plan.description ?? null,
          price: plan.price,
          currency: plan.currency ?? subscription.currency,
        };
      }
    }

    return {
      ...subscription,
      product: productInfo,
    };
  }

  /**
   * 구독 목록 조회 (페이지네이션)
   */
  async getSubscriptions(input: SubscriptionQueryInput) {
    const { page, limit, status, userId } = input;
    const offset = (page - 1) * limit;

    const whereConditions: any[] = [];
    if (userId) whereConditions.push(eq(subscriptions.userId, userId));
    if (status && status !== 'all') whereConditions.push(eq(subscriptions.status, status));

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db.query.subscriptions.findMany({
        where: whereClause,
        limit,
        offset,
        orderBy: [desc(subscriptions.createdAt)],
      }),
      this.db.select({ count: count() }).from(subscriptions).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * 구독 통계 (Admin용)
   */
  async getSubscriptionStats(): Promise<SubscriptionStats> {
    const allSubscriptions = await this.db.query.subscriptions.findMany();

    const stats: SubscriptionStats = {
      total: allSubscriptions.length,
      active: allSubscriptions.filter((s) => s.status === 'active').length,
      cancelled: allSubscriptions.filter((s) => s.status === 'cancelled').length,
      expired: allSubscriptions.filter((s) => s.status === 'expired').length,
      paused: allSubscriptions.filter((s) => s.status === 'paused').length,
      trial: allSubscriptions.filter((s) => s.status === 'on_trial').length,
      mrr: 0,
      arr: 0,
      byPlan: [],
    };

    // MRR/ARR 계산
    for (const sub of allSubscriptions) {
      if (sub.status === 'active' || sub.status === 'on_trial') {
        const monthlyPrice =
          sub.interval === 'year' ? Math.round(sub.price / 12) : sub.price;
        stats.mrr += monthlyPrice;
        stats.arr += sub.interval === 'year' ? sub.price : sub.price * 12;
      }
    }

    // 플랜별 분포 집계
    const allProducts = await this.db.query.products.findMany();
    const productMap = new Map(allProducts.map((p) => [p.id, p.name]));

    const planCounts = allSubscriptions.reduce(
      (acc, sub) => {
        const name = (sub.productId && productMap.get(sub.productId)) || 'Unknown';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    stats.byPlan = Object.entries(planCounts).map(([planName, planCount]) => ({
      planName,
      count: planCount,
      percentage: stats.total > 0 ? Math.round((planCount / stats.total) * 100) : 0,
    }));

    return stats;
  }

  /**
   * 구독자 목록 조회 (Admin용)
   * profiles + subscriptions JOIN, 검색/필터/페이지네이션 지원
   */
  async getSubscribers(input: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    planName?: string;
  }) {
    const { page, limit, search, status, planName } = input;
    const offset = (page - 1) * limit;

    // WHERE 조건 구성
    const whereConditions: ReturnType<typeof eq>[] = [];

    // 이름 또는 이메일 검색
    if (search) {
      const searchPattern = `%${search}%`;
      whereConditions.push(
        or(
          ilike(profiles.name, searchPattern),
          ilike(profiles.email, searchPattern),
        )!,
      );
    }

    // 구독 상태 필터
    if (status && status !== 'all') {
      whereConditions.push(eq(subscriptions.status, status));
    }

    // 플랜(제품명) 필터
    if (planName) {
      whereConditions.push(eq(products.name, planName));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select({
          id: profiles.id,
          name: profiles.name,
          email: profiles.email,
          avatar: profiles.avatar,
          subscriptionId: subscriptions.id,
          planName: products.name,
          status: subscriptions.status,
          statusFormatted: subscriptions.statusFormatted,
          price: subscriptions.price,
          interval: subscriptions.interval,
          currentPeriodEnd: subscriptions.endsAt,
          createdAt: subscriptions.createdAt,
        })
        .from(subscriptions)
        .innerJoin(profiles, eq(subscriptions.userId, profiles.id))
        .leftJoin(products, eq(subscriptions.productId, products.id))
        .where(whereClause)
        .orderBy(desc(subscriptions.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(subscriptions)
        .innerJoin(profiles, eq(subscriptions.userId, profiles.id))
        .leftJoin(products, eq(subscriptions.productId, products.id))
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data, total, page, limit);
  }

  // ========== Orders ==========

  /**
   * 주문 목록 조회
   */
  async getOrders(input: OrderQueryInput) {
    const { page, limit, status, userId } = input;
    const offset = (page - 1) * limit;

    const whereConditions: any[] = [];
    if (userId) whereConditions.push(eq(orders.userId, userId));
    if (status && status !== 'all') whereConditions.push(eq(orders.status, status));

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db.query.orders.findMany({
        where: whereClause,
        limit,
        offset,
        orderBy: [desc(orders.createdAt)],
      }),
      this.db.select({ count: count() }).from(orders).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data, total, page, limit);
  }

  // ========== Licenses ==========

  /**
   * 사용자 라이선스 목록
   */
  async getUserLicenses(userId: string) {
    return this.db.query.licenses.findMany({
      where: eq(licenses.userId, userId),
      orderBy: [desc(licenses.createdAt)],
    });
  }

  /**
   * 라이선스 목록 조회
   */
  async getLicenses(input: LicenseQueryInput) {
    const { page, limit, status, userId } = input;
    const offset = (page - 1) * limit;

    const whereConditions: any[] = [];
    if (userId) whereConditions.push(eq(licenses.userId, userId));
    if (status && status !== 'all') whereConditions.push(eq(licenses.status, status));

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db.query.licenses.findMany({
        where: whereClause,
        limit,
        offset,
        orderBy: [desc(licenses.createdAt)],
      }),
      this.db.select({ count: count() }).from(licenses).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * 라이선스 검증
   */
  async validateLicense(licenseKey: string) {
    const provider = this.providerFactory.getActive();
    const validation = await provider.validateLicenseKey(licenseKey);

    const license = await this.db.query.licenses.findFirst({
      where: eq(licenses.key, licenseKey),
    });

    if (!license) {
      throw new NotFoundException('License not found');
    }

    return {
      valid: validation.valid,
      license,
      meta: {
        activationLimit: validation.activationLimit,
        activationUsage: validation.activationUsage,
      },
    };
  }

  // ========== Refunds ==========

  /**
   * 주문 환불
   */
  async refundOrder(orderId: string, amount?: number, reason?: string) {
    const order = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.refunded) {
      throw new BadRequestException('Order already refunded');
    }

    const refundAmount = amount ?? order.total;

    // 실제 Provider API를 통한 환불 처리
    const provider = this.providerFactory.getByName(order.provider as any);
    const result = await provider.refundOrder(order.externalId, refundAmount);

    if (!result.success) {
      throw new BadRequestException('Refund failed at payment provider');
    }

    // DB 주문 상태 업데이트
    await this.db.update(orders).set({
      refunded: true,
      refundedAt: new Date(),
      refundAmount,
      status: 'refunded',
    }).where(eq(orders.id, orderId));

    logger.info('Order refunded', {
      'payment.order_id': orderId,
      'payment.external_order_id': order.externalId,
      'payment.amount': refundAmount,
      'payment.provider': order.provider,
      'payment.refund_id': result.refundId,
    });

    return {
      success: true,
      orderId,
      amount: refundAmount,
      reason,
      refundId: result.refundId,
    };
  }

  /**
   * 구독 환불 (현재 청구 주기)
   */
  async refundSubscription(subscriptionId: string, reason: string) {
    const subscription = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // 환불 요청 로그 저장
    await this.db.insert(webhookEvents).values({
      provider: subscription.provider,
      eventName: 'subscription_refund_requested',
      eventId: `sub_refund_request_${subscriptionId}_${Date.now()}`,
      payload: {
        subscriptionId,
        reason,
        requestedAt: new Date().toISOString(),
      } as any,
      processed: false,
      testMode: subscription.testMode,
    });

    logger.info('Subscription refund requested', {
      'payment.subscription_id': subscriptionId,
      'payment.provider': subscription.provider,
    });

    return {
      success: true,
      message:
        'Subscription refund request logged. Please process in payment provider dashboard.',
      subscriptionId,
      reason,
    };
  }

  /**
   * 환불 요청 목록 조회 (Admin용)
   */
  async getRefundRequests() {
    return this.db.query.webhookEvents.findMany({
      where: and(
        eq(webhookEvents.eventName, 'refund_requested'),
        eq(webhookEvents.processed, false),
      ),
      orderBy: [desc(webhookEvents.createdAt)],
    });
  }

  // ========== User Refund Requests ==========

  /**
   * 환불 가능 여부 확인
   */
  async checkRefundable(userId: string, orderId: string) {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    });

    if (!order) {
      throw new NotFoundException('주문을 찾을 수 없습니다');
    }

    if (order.refunded) {
      return { refundable: false, reason: '이미 환불된 주문입니다', estimatedAmount: 0 };
    }

    // 환불 기간 확인 (7일)
    const daysSinceOrder = Math.floor(
      (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceOrder > 7) {
      return { refundable: false, reason: '환불 가능 기간(7일)이 초과되었습니다', estimatedAmount: 0 };
    }

    // 진행 중인 환불 요청 확인
    const [existingRequest] = await this.db
      .select()
      .from(refundRequests)
      .where(and(
        eq(refundRequests.orderId, orderId),
        or(
          eq(refundRequests.status, 'pending'),
          eq(refundRequests.status, 'processing'),
        ),
      ))
      .limit(1);

    if (existingRequest) {
      return { refundable: false, reason: '이미 환불 요청이 진행 중입니다', estimatedAmount: 0 };
    }

    return { refundable: true, estimatedAmount: order.total };
  }

  /**
   * 환불 요청 생성
   */
  async requestRefund(userId: string, input: RequestRefundInput) {
    const check = await this.checkRefundable(userId, input.orderId);
    if (!check.refundable) {
      throw new BadRequestException(check.reason);
    }

    const [request] = await this.db
      .insert(refundRequests)
      .values({
        userId,
        orderId: input.orderId,
        reasonType: input.reasonType,
        reasonDetail: input.reasonDetail,
        requestedAmount: check.estimatedAmount,
        status: 'pending',
      })
      .returning();

    logger.info('Refund requested', {
      'payment.refund_request_id': request!.id,
      'payment.order_id': input.orderId,
      'user.id': userId,
    });

    return request;
  }

  /**
   * 내 환불 요청 목록 조회
   */
  async getMyRefundRequests(userId: string, input: { page: number; limit: number }) {
    const { page, limit } = input;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(refundRequests)
        .where(eq(refundRequests.userId, userId))
        .orderBy(desc(refundRequests.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(refundRequests).where(eq(refundRequests.userId, userId)),
    ]);

    const total = totalResult[0]?.count ?? 0;
    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * [Admin] 환불 요청 처리
   */
  async adminProcessRefundRequest(adminId: string, input: { requestId: string; action: 'approve' | 'reject'; adminNote?: string }) {
    const [request] = await this.db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, input.requestId))
      .limit(1);

    if (!request) {
      throw new NotFoundException('환불 요청을 찾을 수 없습니다');
    }

    if (request.status !== 'pending' && request.status !== 'processing') {
      throw new BadRequestException('이미 처리된 환불 요청입니다');
    }

    if (input.action === 'approve' && request.orderId) {
      await this.refundOrder(request.orderId, request.requestedAmount ?? undefined, '유저 환불 요청 승인');
    }

    const [updated] = await this.db
      .update(refundRequests)
      .set({
        status: input.action === 'approve' ? 'approved' : 'rejected',
        adminNote: input.adminNote,
        processedBy: adminId,
        processedAt: new Date(),
      })
      .where(eq(refundRequests.id, input.requestId))
      .returning();

    logger.info('Refund request processed', {
      'payment.refund_request_id': input.requestId,
      'payment.action': input.action,
      'user.id': adminId,
    });

    return updated;
  }
}
