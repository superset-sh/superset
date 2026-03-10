import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Polar } from '@polar-sh/sdk';
import { createLogger } from '../../../core/logger';
import { paymentConfig } from '../config/payment.config';
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
  SubscriptionStatus,
} from '../types/normalized.types';
import { POLAR_EVENT_MAP, POLAR_STATUS_MAP } from '../types/polar.types';

/**
 * Polar SDK 타입 별칭.
 * atlas-server의 moduleResolution: "node"에서는 @polar-sh/sdk 서브패스 import가
 * 불가능하므로 SDK 클라이언트 메서드의 반환 타입으로 추론하여 사용.
 */
type PolarClient = InstanceType<typeof Polar>;
type PolarProduct = Awaited<ReturnType<PolarClient['products']['get']>>;
type PolarPrices = PolarProduct['prices'][number];
type PolarSubscription = Awaited<ReturnType<PolarClient['subscriptions']['get']>>;
type PolarBenefit = PolarProduct['benefits'][number];
type PolarValidatedLicenseKey = Awaited<ReturnType<PolarClient['licenseKeys']['activate']>>['licenseKey'];
// SubscriptionUpdate는 union 타입 — 실제 사용 시 Record<string, unknown>으로 전달하므로 any 캐스트 사용

const logger = createLogger('payment');

@Injectable()
export class PolarProvider implements PaymentProvider {
  readonly providerName: PaymentProviderName = 'polar';
  private readonly client: Polar;

  constructor(
    @Inject(paymentConfig.KEY)
    private config: ConfigType<typeof paymentConfig>,
  ) {
    this.client = new Polar({
      accessToken: this.config.polarAccessToken,
    });
  }

  // ========== Products ==========

  async getProducts(): Promise<NormalizedProduct[]> {
    const products: NormalizedProduct[] = [];
    const result = await this.client.products.list({
      organizationId: this.config.polarOrganizationId,
    });

    for await (const page of result) {
      const items = page.result.items;
      for (const product of items) {
        products.push(this.normalizeProduct(product));
      }
    }

    return products;
  }

  async getProduct(id: string): Promise<NormalizedProduct> {
    const product = await this.client.products.get({ id });
    return this.normalizeProduct(product);
  }

  // ========== Variants ==========

  /**
   * Polar는 별도 Variant 개념이 없음.
   * 각 Product의 prices를 Variant로 매핑하여 반환.
   */
  async getVariants(productId?: string): Promise<NormalizedVariant[]> {
    if (productId) {
      const product = await this.client.products.get({ id: productId });
      return this.extractVariantsFromProduct(product);
    }

    // 전체 상품 조회 후 모든 prices를 Variant로 변환
    const variants: NormalizedVariant[] = [];
    const result = await this.client.products.list({
      organizationId: this.config.polarOrganizationId,
    });

    for await (const page of result) {
      for (const product of page.result.items) {
        variants.push(...this.extractVariantsFromProduct(product));
      }
    }

    return variants;
  }

  /**
   * Polar는 별도 PriceModel이 없음.
   * 기본 가격 정보만 반환.
   */
  async getVariantPriceModel(variantId: string): Promise<NormalizedPriceModel | null> {
    // variantId는 Polar에서 productId로 사용됨
    try {
      const product = await this.client.products.get({ id: variantId });
      const price = product.prices[0];
      if (!price) return null;

      return {
        id: variantId,
        scheme: 'standard',
        unitPrice: 'amountType' in price && price.amountType === 'fixed'
          ? (price as { priceAmount: number }).priceAmount / 100
          : 0,
        renewalIntervalUnit: product.recurringInterval ?? null,
        tiers: null,
      };
    } catch {
      return null;
    }
  }

  // ========== Checkout ==========

  async createCheckout(data: NormalizedCheckoutInput): Promise<{ checkoutUrl: string }> {
    const checkout = await this.client.checkouts.create({
      products: [data.variantOrProductId],
      customerEmail: data.email,
      customerName: data.name,
      successUrl: data.redirectUrl,
      metadata: data.customData
        ? Object.fromEntries(
            Object.entries(data.customData).map(([k, v]) => [k, v as string]),
          )
        : undefined,
    });

    logger.info('Checkout created', {
      'payment.provider': this.providerName,
      'payment.checkout_id': checkout.id,
      'payment.product_id': data.variantOrProductId,
    });

    return { checkoutUrl: checkout.url };
  }

  // ========== Subscriptions ==========

  async getSubscription(externalId: string): Promise<NormalizedSubscription> {
    const subscription = await this.client.subscriptions.get({ id: externalId });
    return this.normalizeSubscription(subscription);
  }

  async updateSubscription(
    externalId: string,
    data: Record<string, unknown>,
  ): Promise<NormalizedSubscription> {
    const subscription = await this.client.subscriptions.update({
      id: externalId,
      subscriptionUpdate: data as any,
    });

    logger.info('Subscription updated', {
      'payment.provider': this.providerName,
      'payment.subscription_id': externalId,
    });

    return this.normalizeSubscription(subscription);
  }

  async cancelSubscription(externalId: string): Promise<NormalizedSubscription> {
    const subscription = await this.client.subscriptions.revoke({ id: externalId });

    logger.info('Subscription cancelled', {
      'payment.provider': this.providerName,
      'payment.subscription_id': externalId,
    });

    return this.normalizeSubscription(subscription);
  }

  // ========== License Keys ==========

  async validateLicenseKey(key: string): Promise<NormalizedLicenseValidation> {
    const result = await this.client.licenseKeys.validate({
      key,
      organizationId: this.config.polarOrganizationId,
    });

    return {
      valid: result.status === 'granted',
      status: result.status,
      activationLimit: result.limitActivations,
      activationUsage: result.usage,
    };
  }

  async activateLicenseKey(key: string, instanceName: string): Promise<NormalizedLicenseKey> {
    const result = await this.client.licenseKeys.activate({
      key,
      organizationId: this.config.polarOrganizationId,
      label: instanceName,
    });

    logger.info('License key activated', {
      'payment.provider': this.providerName,
      'payment.license_key_id': result.licenseKeyId,
    });

    return this.normalizeLicenseKey(result.licenseKey);
  }

  async deactivateLicenseKey(key: string, instanceId: string): Promise<void> {
    await this.client.licenseKeys.deactivate({
      key,
      organizationId: this.config.polarOrganizationId,
      activationId: instanceId,
    });

    logger.info('License key deactivated', {
      'payment.provider': this.providerName,
    });
  }

  // ========== Refunds ==========

  async refundOrder(externalOrderId: string, amount?: number): Promise<{ success: boolean; refundId?: string }> {
    // Polar SDK requires amount in cents
    // 전액 환불 시에도 amount가 필요하므로, 없으면 주문 조회 후 결정
    let refundAmountCents = amount ? amount : 0;
    if (!refundAmountCents) {
      // amount가 0이면 전액 환불: 주문 조회하여 총액 가져옴
      const order = await this.client.orders.get({ id: externalOrderId });
      refundAmountCents = order.totalAmount;
    }

    const refund = await this.client.refunds.create({
      orderId: externalOrderId,
      reason: 'customer_request',
      amount: refundAmountCents,
    });

    logger.info('Order refunded', {
      'payment.provider': this.providerName,
      'payment.order_id': externalOrderId,
      'payment.refund_id': refund.id,
    });

    return {
      success: true,
      refundId: refund.id,
    };
  }

  // ========== Webhook ==========

  parseWebhook(payload: unknown): NormalizedWebhookEvent {
    const webhookPayload = payload as {
      type: string;
      data: { id: string; [key: string]: unknown };
    };
    const eventType = this.mapEventName(webhookPayload.type);

    return {
      eventType,
      externalId: webhookPayload.data.id,
      data: webhookPayload.data,
      customData: undefined,
      testMode: false,
    };
  }

  /**
   * Polar webhook 서명 검증.
   * Standard Webhooks 스펙: HMAC-SHA256 with base64-encoded secret.
   * signature 파라미터는 컨트롤러에서 "webhookId.webhookTimestamp.webhookSignature" 형식으로 결합하여 전달.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    try {
      const secret = this.config.polarWebhookSecret;

      // Standard Webhooks: secret은 "whsec_" 접두사 + base64 인코딩
      const secretBytes = Buffer.from(
        secret.startsWith('whsec_') ? secret.slice(6) : secret,
        'base64',
      );

      // signature 파라미터: "webhookId.webhookTimestamp.webhookSignature"
      const parts = signature.split('.');
      if (parts.length < 3) {
        return false;
      }

      const webhookId = parts[0]!;
      const webhookTimestamp = parts[1]!;
      const webhookSignatures = parts.slice(2).join('.');

      // Timestamp tolerance check (5분)
      const now = Math.floor(Date.now() / 1000);
      const ts = parseInt(webhookTimestamp, 10);
      if (isNaN(ts) || Math.abs(now - ts) > 300) {
        return false;
      }

      // Standard Webhooks: sign(webhookId + "." + webhookTimestamp + "." + rawBody)
      const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
      const expectedSignature = createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

      // webhookSignature는 "v1,<base64>" 형식일 수 있으므로 각 서명을 검사
      const signatures = webhookSignatures.split(' ');
      for (const sig of signatures) {
        const sigValue = sig.startsWith('v1,') ? sig.slice(3) : sig;
        const sigBuffer = Buffer.from(sigValue, 'base64');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64');

        if (sigBuffer.length === expectedBuffer.length && timingSafeEqual(sigBuffer, expectedBuffer)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  // ========== Store/Org ==========

  getStoreId(): string {
    return this.config.polarOrganizationId;
  }

  async getStoreCurrency(): Promise<string> {
    // Polar는 기본적으로 USD를 사용
    return 'USD';
  }

  // ========== Private Helpers ==========

  private normalizeProduct(product: PolarProduct): NormalizedProduct {
    // visibility: 'public' -> published, 그 외 -> draft
    const status: 'draft' | 'published' =
      product.visibility === 'public' ? 'published' : 'draft';

    // 첫 번째 price에서 가격 추출
    const firstPrice = product.prices[0];
    let price = 0;
    if (firstPrice && 'amountType' in firstPrice) {
      if (firstPrice.amountType === 'fixed' && 'priceAmount' in firstPrice) {
        price = (firstPrice as { priceAmount: number }).priceAmount / 100;
      }
    }

    return {
      externalId: product.id,
      name: product.name,
      description: product.description ?? null,
      status,
      price,
      currency: 'USD',
    };
  }

  private extractVariantsFromProduct(product: PolarProduct): NormalizedVariant[] {
    if (product.prices.length === 0) {
      // 가격이 없는 경우 상품 자체를 하나의 Variant로 반환
      return [
        {
          externalId: product.id,
          productExternalId: product.id,
          name: product.name,
          price: 0,
          isSubscription: product.isRecurring,
          interval: product.recurringInterval ?? null,
          intervalCount: product.recurringIntervalCount ?? null,
          hasLicenseKeys: false,
          sort: 0,
        },
      ];
    }

    return product.prices.map((priceItem: PolarPrices, index: number) => {
      let price = 0;
      if ('amountType' in priceItem && priceItem.amountType === 'fixed' && 'priceAmount' in priceItem) {
        price = (priceItem as { priceAmount: number }).priceAmount / 100;
      }

      const priceId = 'id' in priceItem ? (priceItem as { id: string }).id : product.id;

      return {
        externalId: priceId,
        productExternalId: product.id,
        name: product.name,
        price,
        isSubscription: product.isRecurring,
        interval: product.recurringInterval ?? null,
        intervalCount: product.recurringIntervalCount ?? null,
        hasLicenseKeys: product.benefits.some(
          (b: PolarBenefit) => b.type === 'license_keys',
        ),
        sort: index,
      };
    });
  }

  private normalizeSubscription(sub: PolarSubscription): NormalizedSubscription {
    const normalizedStatus = (POLAR_STATUS_MAP[sub.status] ?? 'active') as SubscriptionStatus;
    const statusFormatted = sub.status.charAt(0).toUpperCase() + sub.status.slice(1);

    return {
      externalId: sub.id,
      productExternalId: sub.productId,
      variantExternalId: sub.productId,
      customerEmail: sub.customer.email,
      customerName: sub.customer.name ?? null,
      status: normalizedStatus,
      statusFormatted,
      price: sub.amount / 100,
      currency: sub.currency,
      interval: sub.recurringInterval,
      renewsAt: sub.currentPeriodEnd?.toISOString() ?? '',
      endsAt: sub.endsAt?.toISOString() ?? null,
      trialEndsAt: sub.trialEnd?.toISOString() ?? null,
      billingAnchor: null,
      firstSubscriptionItemId: null,
      testMode: false,
      urls: {},
    };
  }

  private normalizeLicenseKey(
    licenseKey: PolarValidatedLicenseKey,
  ): NormalizedLicenseKey {
    return {
      externalId: licenseKey.id,
      key: licenseKey.key,
      status: licenseKey.status,
      statusFormatted:
        licenseKey.status.charAt(0).toUpperCase() + licenseKey.status.slice(1),
      activationLimit: licenseKey.limitActivations,
      activationUsage: licenseKey.usage,
      expiresAt: licenseKey.expiresAt?.toISOString() ?? null,
      testMode: false,
    };
  }

  private mapEventName(polarEvent: string): NormalizedWebhookEventType {
    const normalized = POLAR_EVENT_MAP[polarEvent];
    if (!normalized) {
      logger.warn('Unknown webhook event', {
        'payment.provider': this.providerName,
        'payment.event_name': polarEvent,
      });
      // 매핑되지 않는 이벤트는 subscription_updated로 폴백
      return 'subscription_updated';
    }

    return normalized;
  }
}
