import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@superbuilder/drizzle';
import type { DrizzleDB } from '@superbuilder/drizzle';
import { eq } from 'drizzle-orm';
import { subscriptions, orders, licenses, webhookEvents, profiles, products, paymentPlans } from '@superbuilder/drizzle';
import type { OrderStatus } from '@superbuilder/drizzle';
import { createLogger } from '../../../core/logger';
import type {
  NormalizedWebhookEvent,
  NormalizedSubscription,
  NormalizedOrder,
  NormalizedLicenseKey,
  PaymentProviderName,
} from '../types/normalized.types';
import type { PlanService } from './plan.service';

const logger = createLogger('payment');

@Injectable()
export class WebhookService {
  private planService: PlanService | null = null;

  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /** PlanService 주입 (Module.onModuleInit에서 호출) */
  setPlanService(service: PlanService) {
    this.planService = service;
  }

  /**
   * 웹훅 이벤트 처리
   */
  async handleWebhook(event: NormalizedWebhookEvent, provider: PaymentProviderName): Promise<void> {
    const eventName = event.eventType;
    const customData = event.customData;
    const eventId = `${eventName}_${event.externalId}_${Date.now()}`;

    // 웹훅 이벤트 로그 저장
    await this.db.insert(webhookEvents).values({
      provider,
      eventName,
      eventId,
      payload: event as any,
      testMode: event.testMode,
    });

    try {
      switch (eventName) {
        case 'subscription_created':
        case 'subscription_updated':
          await this.handleSubscriptionEvent(
            event.data as NormalizedSubscription,
            event.externalId,
            provider,
            customData,
          );
          break;

        case 'subscription_cancelled':
        case 'subscription_expired':
          await this.handleSubscriptionCancellation(event.externalId, provider);
          break;

        case 'subscription_paused':
          await this.handleSubscriptionPaused(event.externalId, provider);
          break;

        case 'subscription_resumed':
          await this.handleSubscriptionResumed(event.externalId, provider);
          break;

        case 'order_created':
          await this.handleOrderCreated(event.data as NormalizedOrder, event.externalId, provider, customData);
          break;

        case 'order_refunded':
          await this.handleOrderRefunded(event.externalId, provider);
          break;

        case 'license_key_created':
        case 'license_key_updated':
          await this.handleLicenseEvent(event.data as NormalizedLicenseKey, event.externalId, provider);
          break;

        default:
          logger.warn('Unhandled webhook event', {
            'payment.event_type': eventName,
            'payment.provider': provider,
          });
      }

      // 처리 완료 표시
      await this.db
        .update(webhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(eq(webhookEvents.eventId, eventId));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Webhook processing failed', {
        'payment.event_type': eventName,
        'payment.external_id': event.externalId,
        'payment.provider': provider,
        'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
        'error.message': errorMessage,
      });

      // 에러 기록
      await this.db
        .update(webhookEvents)
        .set({
          error: errorMessage,
          retryCount: 1,
        })
        .where(eq(webhookEvents.eventId, eventId));

      throw error;
    }
  }

  /**
   * custom_data 또는 이메일로 userId 조회
   */
  private async resolveUserId(
    customData?: Record<string, string>,
    email?: string,
  ): Promise<string | null> {
    // 1. custom_data에서 user_id 추출
    if (customData?.user_id) {
      return customData.user_id;
    }

    // 2. 이메일로 profiles 테이블 조회
    if (email) {
      const profile = await this.db.query.profiles.findFirst({
        where: eq(profiles.email, email),
        columns: { id: true },
      });

      if (profile) {
        return profile.id;
      }
    }

    return null;
  }

  /**
   * 구독 이벤트 처리
   * - variantExternalId로 paymentPlans 매칭 → 실제 가격/통화/구간 사용
   * - productExternalId로 products 매칭 → productId 설정
   * - 구독 생성/업데이트 후 크레딧 할당
   */
  private async handleSubscriptionEvent(
    data: NormalizedSubscription,
    externalId: string,
    provider: PaymentProviderName,
    customData?: Record<string, string>,
  ): Promise<void> {
    const userId = await this.resolveUserId(customData, data.customerEmail);

    if (!userId) {
      logger.warn('Subscription webhook missing userId', {
        'payment.external_id': externalId,
        'payment.customer_email': data.customerEmail,
        'payment.provider': provider,
      });
      return;
    }

    // 1. variantExternalId로 paymentPlans 매칭 → 실제 가격 정보 조회
    const variantId = data.variantExternalId;
    const plan = await this.db.query.paymentPlans.findFirst({
      where: eq(paymentPlans.providerVariantId, variantId),
    });

    const price = plan?.price ?? 0;
    const currency = plan?.currency ?? 'USD';
    const interval = plan?.interval ?? 'month';

    // 2. productExternalId로 products 매칭 → DB productId
    const productExternalId = data.productExternalId;
    const product = await this.db.query.products.findFirst({
      where: eq(products.externalId, productExternalId),
    });
    const productId = product?.id ?? undefined;

    await this.db
      .insert(subscriptions)
      .values({
        externalId,
        provider,
        userId,
        productId,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        status: data.status,
        statusFormatted: data.statusFormatted,
        price,
        currency,
        interval,
        intervalCount: 1,
        trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : null,
        renewsAt: new Date(data.renewsAt),
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        billingAnchor: data.billingAnchor,
        firstSubscriptionItemId: data.firstSubscriptionItemId,
        testMode: data.testMode,
        urls: data.urls as any,
      })
      .onConflictDoUpdate({
        target: [subscriptions.externalId, subscriptions.provider],
        set: {
          productId,
          status: data.status,
          statusFormatted: data.statusFormatted,
          price,
          currency,
          interval,
          renewsAt: new Date(data.renewsAt),
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
        },
      });

    // 3. 크레딧 할당 (플랜 매칭 성공 시)
    if (plan && this.planService) {
      try {
        await this.planService.assignPlanToUser(userId, plan.id);
        logger.info('Credits assigned', {
          'payment.user_id': userId,
          'payment.plan_name': plan.name,
          'payment.provider': provider,
        });
      } catch (error) {
        logger.error('Credits assignment failed', {
          'payment.user_id': userId,
          'payment.plan_id': plan.id,
          'payment.provider': provider,
          'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
          'error.message': error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 구독 취소 처리
   */
  private async handleSubscriptionCancellation(externalId: string, _provider: PaymentProviderName): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
      })
      .where(eq(subscriptions.externalId, externalId));
  }

  /**
   * 구독 일시정지 처리
   */
  private async handleSubscriptionPaused(externalId: string, _provider: PaymentProviderName): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({
        status: 'paused',
        pausedAt: new Date(),
      })
      .where(eq(subscriptions.externalId, externalId));
  }

  /**
   * 구독 재개 처리
   */
  private async handleSubscriptionResumed(externalId: string, _provider: PaymentProviderName): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({
        status: 'active',
        pausedAt: null,
        resumesAt: null,
      })
      .where(eq(subscriptions.externalId, externalId));
  }

  /**
   * 주문 생성 처리
   */
  private async handleOrderCreated(
    data: NormalizedOrder,
    externalId: string,
    provider: PaymentProviderName,
    customData?: Record<string, string>,
  ): Promise<void> {
    const userId = await this.resolveUserId(customData, data.customerEmail);

    if (!userId) {
      logger.warn('Order webhook missing userId', {
        'payment.external_id': externalId,
        'payment.customer_email': data.customerEmail,
        'payment.provider': provider,
      });
    }

    await this.db.insert(orders).values({
      externalId,
      provider,
      userId: userId ?? undefined,
      orderNumber: data.orderNumber,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      status: (data.status as OrderStatus) ?? 'pending',
      statusFormatted: data.statusFormatted,
      subtotal: data.subtotal,
      discount: data.discount,
      tax: data.tax,
      total: data.total,
      currency: data.currency,
      testMode: data.testMode,
      urls: data.urls as any,
    });
  }

  /**
   * 주문 환불 처리
   */
  private async handleOrderRefunded(externalId: string, _provider: PaymentProviderName): Promise<void> {
    await this.db
      .update(orders)
      .set({
        status: 'refunded',
        refunded: true,
        refundedAt: new Date(),
      })
      .where(eq(orders.externalId, externalId));
  }

  /**
   * 라이선스 이벤트 처리
   */
  private async handleLicenseEvent(
    data: NormalizedLicenseKey,
    externalId: string,
    provider: PaymentProviderName,
  ): Promise<void> {
    await this.db
      .insert(licenses)
      .values({
        externalId,
        provider,
        key: data.key,
        status: data.status,
        statusFormatted: data.statusFormatted,
        activationLimit: data.activationLimit,
        activationUsage: data.activationUsage,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        testMode: data.testMode,
      })
      .onConflictDoUpdate({
        target: licenses.key,
        set: {
          status: data.status,
          activationUsage: data.activationUsage,
        },
      });
  }
}
