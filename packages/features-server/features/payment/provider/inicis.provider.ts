import { Injectable, Inject, NotImplementedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectDrizzle } from '@superbuilder/drizzle';
import type { DrizzleDB } from '@superbuilder/drizzle';
import { products, orders } from '@superbuilder/drizzle';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../../core/logger';
import { paymentConfig } from '../config/payment.config';
import { InicisService } from '../service/inicis.service';
import type { PaymentProvider } from './payment-provider.interface';
import type {
  PaymentProviderName,
  NormalizedProduct,
  NormalizedVariant,
  NormalizedPriceModel,
  NormalizedCheckoutInput,
  NormalizedSubscription,
  NormalizedLicenseKey,
  NormalizedLicenseValidation,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
} from '../types/normalized.types';
import {
  INICIS_ENDPOINTS,
  INICIS_EVENT_MAP,
} from '../types/inicis.types';
import type { InicisVbankNotiPayload } from '../types/inicis.types';

const logger = createLogger('payment');

/**
 * KG이니시스 결제 Provider
 *
 * INICIS는 PG(Payment Gateway)로, SaaS 결제 플랫폼(LS/Polar)과 근본적으로 다르다.
 * - 상품 카탈로그 없음 → 로컬 DB 상품으로 대체
 * - 구독/라이선스 관리 없음 → NotImplementedException
 * - 리다이렉트 기반 결제 플로우 → Form POST → 인증 → 콜백 → 승인
 */
@Injectable()
export class InicisProvider implements PaymentProvider {
  readonly providerName: PaymentProviderName = 'inicis';

  constructor(
    @Inject(paymentConfig.KEY)
    private config: ConfigType<typeof paymentConfig>,
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly inicisService: InicisService,
  ) {}

  // ========== Products ==========

  /**
   * INICIS는 상품 카탈로그가 없으므로 로컬 DB에서 조회한다.
   */
  async getProducts(): Promise<NormalizedProduct[]> {
    const items = await this.db.query.products.findMany({
      where: eq(products.provider, 'inicis'),
    });

    return items.map((item) => ({
      externalId: item.id,
      name: item.name,
      description: item.description ?? null,
      status: 'published' as const,
      price: item.price / 100,
      currency: 'KRW',
    }));
  }

  async getProduct(id: string): Promise<NormalizedProduct> {
    const item = await this.db.query.products.findFirst({
      where: eq(products.id, id),
    });

    if (!item) {
      throw new Error(`Product not found: ${id}`);
    }

    return {
      externalId: item.id,
      name: item.name,
      description: item.description ?? null,
      status: 'published',
      price: item.price / 100,
      currency: 'KRW',
    };
  }

  // ========== Variants ==========

  /**
   * INICIS는 Variant 개념이 없으므로 상품 자체를 1:1 매핑한다.
   */
  async getVariants(productId?: string): Promise<NormalizedVariant[]> {
    const items = productId
      ? await this.db.query.products.findMany({
          where: eq(products.id, productId),
        })
      : await this.db.query.products.findMany({
          where: eq(products.provider, 'inicis'),
        });

    return items.map((item, index) => ({
      externalId: item.id,
      productExternalId: item.id,
      name: item.name,
      price: item.price / 100,
      isSubscription: false,
      interval: null,
      intervalCount: null,
      hasLicenseKeys: false,
      sort: index,
    }));
  }

  async getVariantPriceModel(variantId: string): Promise<NormalizedPriceModel | null> {
    const item = await this.db.query.products.findFirst({
      where: eq(products.id, variantId),
    });

    if (!item) return null;

    return {
      id: variantId,
      scheme: 'standard',
      unitPrice: item.price / 100,
      renewalIntervalUnit: null,
      tiers: null,
    };
  }

  // ========== Checkout ==========

  /**
   * INICIS 모바일 표준결제 URL을 생성한다.
   *
   * INICIS는 Hosted Checkout이 아닌 Form POST 방식이므로,
   * checkoutUrl에 결제창 URL을, customData에 form 필드 데이터를 포함하여 반환한다.
   * 클라이언트는 이 정보를 이용하여 Form POST를 수행해야 한다.
   */
  async createCheckout(data: NormalizedCheckoutInput): Promise<{ checkoutUrl: string }> {
    const mid = this.config.inicisMid;
    const timestamp = Date.now().toString();
    const orderId = `ORD-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;

    // 가격 위변조 방지 해시 생성
    const amount = data.customPrice ? data.customPrice.toString() : '0';
    const chkFake = this.inicisService.createFakeCheckHash(amount, orderId, timestamp);

    // 모바일 결제창 URL (항상 동일)
    const paymentUrl = INICIS_ENDPOINTS.MOBILE_PAYMENT;

    // P_NEXT_URL은 서버의 고정 콜백 엔드포인트를 사용한다.
    // 사용자 리다이렉트 URL은 P_NOTI(customData)에 포함하여 콜백에서 처리한다.
    const serverCallbackUrl = `${process.env.VITE_SUPABASE_URL ? '' : 'http://localhost:3002'}/api/payment/inicis/callback`;

    // customData에 사용자 리다이렉트 URL 병합
    const notiData = {
      ...(data.customData ?? {}),
      ...(data.redirectUrl ? { successUrl: data.redirectUrl, failUrl: data.redirectUrl } : {}),
    };

    // Form 필드 데이터를 query string으로 인코딩하여 URL에 포함
    // 클라이언트에서 이 URL로 Form POST를 수행한다.
    // 상품명 조회 (P_GOODS는 상품명이어야 함, ID가 아님)
    const product = await this.db.query.products.findFirst({
      where: eq(products.id, data.variantOrProductId),
    });
    const goodsName = product?.name ?? data.variantOrProductId;

    const formParams = new URLSearchParams({
      P_INI_PAYMENT: 'CARD',
      P_MID: mid,
      P_OID: orderId,
      P_AMT: amount,
      P_GOODS: goodsName,
      P_UNAME: data.name ?? '',
      P_EMAIL: data.email ?? '',
      P_NEXT_URL: serverCallbackUrl,
      P_RESERVED: 'centerCd=Y&amt_hash=Y',
      P_CHARSET: 'utf8',
      P_CHKFAKE: chkFake,
      P_TIMESTAMP: timestamp,
      P_NOTI: Object.keys(notiData).length > 0 ? JSON.stringify(notiData) : '',
    });

    logger.info('INICIS checkout created', {
      'payment.provider': this.providerName,
      'payment.order_id': orderId,
      'payment.product_id': data.variantOrProductId,
    });

    // checkoutUrl에 form 필드를 query string으로 포함
    return { checkoutUrl: `${paymentUrl}?${formParams.toString()}` };
  }

  // ========== Subscriptions (미지원) ==========

  async getSubscription(_externalId: string): Promise<NormalizedSubscription> {
    throw new NotImplementedException('INICIS does not support subscription management');
  }

  async updateSubscription(
    _externalId: string,
    _data: Record<string, unknown>,
  ): Promise<NormalizedSubscription> {
    throw new NotImplementedException('INICIS does not support subscription management');
  }

  async cancelSubscription(_externalId: string): Promise<NormalizedSubscription> {
    throw new NotImplementedException('INICIS does not support subscription management');
  }

  // ========== License Keys (미지원) ==========

  async validateLicenseKey(_key: string): Promise<NormalizedLicenseValidation> {
    throw new NotImplementedException('INICIS does not support license key management');
  }

  async activateLicenseKey(_key: string, _instanceName: string): Promise<NormalizedLicenseKey> {
    throw new NotImplementedException('INICIS does not support license key management');
  }

  async deactivateLicenseKey(_key: string, _instanceId: string): Promise<void> {
    throw new NotImplementedException('INICIS does not support license key management');
  }

  // ========== Refunds ==========

  /**
   * INICIS Cancel API V2로 결제를 취소한다.
   * externalOrderId는 INICIS TID(거래번호)를 사용한다.
   */
  async refundOrder(
    externalOrderId: string,
    amount?: number,
  ): Promise<{ success: boolean; refundId?: string }> {
    // orders 테이블에서 TID 조회
    const order = await this.db.query.orders.findFirst({
      where: eq(orders.externalId, externalOrderId),
    });

    const tid = order?.externalId ?? externalOrderId;

    const result = await this.inicisService.cancelPayment(
      tid,
      'customer_request',
      amount,
    );

    return {
      success: result.resultCode === '00',
      refundId: result.tid,
    };
  }

  // ========== Webhook ==========

  /**
   * INICIS 가상계좌 입금통보 파싱
   */
  parseWebhook(payload: unknown): NormalizedWebhookEvent {
    const notiPayload = payload as InicisVbankNotiPayload;
    const eventType = this.mapEventName(notiPayload.type_msg);

    return {
      eventType,
      externalId: notiPayload.no_tid,
      data: notiPayload,
      customData: undefined,
      testMode: this.config.inicisMid === 'INIpayTest',
    };
  }

  /**
   * INICIS 웹훅 서명 검증
   * INICIS 가상계좌 입금통보는 별도 서명 메커니즘이 없으므로
   * IP 기반 화이트리스트를 사용하는 것이 권장된다.
   * 여기서는 기본적으로 true를 반환하되, 추후 IP 화이트리스트를 추가할 수 있다.
   */
  verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
    // INICIS 가상계좌 입금통보는 서명 기반이 아닌 IP 기반 검증을 사용한다.
    // 실 운영 시에는 NestJS Guard 또는 Middleware에서 IP 화이트리스트를 적용해야 한다.
    logger.warn('INICIS webhook signature verification is IP-based, not signature-based', {
      'payment.provider': this.providerName,
    });
    return true;
  }

  // ========== Store/Org ==========

  getStoreId(): string {
    return this.config.inicisMid;
  }

  async getStoreCurrency(): Promise<string> {
    return 'KRW';
  }

  // ========== Private Helpers ==========

  private mapEventName(inicisEvent: string): NormalizedWebhookEventType {
    const normalized = INICIS_EVENT_MAP[inicisEvent];
    if (!normalized) {
      logger.warn('Unknown INICIS webhook event', {
        'payment.provider': this.providerName,
        'payment.event_name': inicisEvent,
      });
      return 'order_created';
    }
    return normalized;
  }
}
