import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createLogger } from '../../../core/logger';
import { paymentConfig } from '../config/payment.config';
import { LemonSqueezyService } from '../service/lemon-squeezy.service';
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
import type {
  LemonSqueezyProduct,
  LemonSqueezyVariant,
  LemonSqueezySubscription,
  LemonSqueezyLicenseKey,
  WebhookPayload,
  WebhookEventName,
} from '../types/lemon-squeezy.types';

const logger = createLogger('payment');

@Injectable()
export class LemonSqueezyProvider implements PaymentProvider {
  readonly providerName: PaymentProviderName = 'lemon-squeezy';

  constructor(
    private readonly lsService: LemonSqueezyService,
    @Inject(paymentConfig.KEY)
    private config: ConfigType<typeof paymentConfig>,
  ) {}

  // ========== Products ==========

  async getProducts(): Promise<NormalizedProduct[]> {
    const res = await this.lsService.getProducts();
    return res.data.map((item) => this.normalizeProduct(item.id, item.attributes));
  }

  async getProduct(id: string): Promise<NormalizedProduct> {
    const res = await this.lsService.getProduct(id);
    return this.normalizeProduct(res.data.id, res.data.attributes);
  }

  // ========== Variants ==========

  async getVariants(productId?: string): Promise<NormalizedVariant[]> {
    const res = await this.lsService.getVariants(productId);
    return res.data.map((item) => this.normalizeVariant(item.id, item.attributes));
  }

  async getVariantPriceModel(variantId: string): Promise<NormalizedPriceModel | null> {
    const priceModel = await this.lsService.getVariantPriceModel(variantId);
    if (!priceModel) return null;

    return {
      id: priceModel.id,
      scheme: priceModel.attributes.scheme,
      unitPrice: priceModel.attributes.unit_price / 100,
      renewalIntervalUnit: priceModel.attributes.renewal_interval_unit,
      tiers: priceModel.attributes.tiers
        ? priceModel.attributes.tiers.map((tier) => ({
            lastUnit: tier.last_unit,
            unitPrice: tier.unit_price / 100,
            fixedFee: tier.fixed_fee / 100,
          }))
        : null,
    };
  }

  // ========== Checkout ==========

  async createCheckout(data: NormalizedCheckoutInput): Promise<{ checkoutUrl: string }> {
    const res = await this.lsService.createCheckout({
      store_id: data.storeOrOrgId,
      variant_id: data.variantOrProductId,
      custom_price: data.customPrice != null ? data.customPrice * 100 : undefined,
      checkout_data: {
        email: data.email,
        name: data.name,
        discount_code: data.discountCode,
        custom: data.customData,
      },
      product_options: {
        redirect_url: data.redirectUrl,
      },
      test_mode: data.testMode,
    });

    logger.info('Checkout created', {
      'payment.provider': this.providerName,
      'payment.checkout_id': res.data.id,
      'payment.variant_id': data.variantOrProductId,
    });

    return { checkoutUrl: res.data.attributes.url };
  }

  // ========== Subscriptions ==========

  async getSubscription(externalId: string): Promise<NormalizedSubscription> {
    const res = await this.lsService.getSubscription(externalId);
    return this.normalizeSubscription(res.data.id, res.data.attributes);
  }

  async updateSubscription(
    externalId: string,
    data: Record<string, unknown>,
  ): Promise<NormalizedSubscription> {
    const res = await this.lsService.updateSubscription(
      externalId,
      data as Partial<LemonSqueezySubscription>,
    );

    logger.info('Subscription updated', {
      'payment.provider': this.providerName,
      'payment.subscription_id': externalId,
    });

    return this.normalizeSubscription(res.data.id, res.data.attributes);
  }

  async cancelSubscription(externalId: string): Promise<NormalizedSubscription> {
    const res = await this.lsService.cancelSubscription(externalId);

    logger.info('Subscription cancelled', {
      'payment.provider': this.providerName,
      'payment.subscription_id': externalId,
    });

    return this.normalizeSubscription(res.data.id, res.data.attributes);
  }

  // ========== License Keys ==========

  async validateLicenseKey(key: string): Promise<NormalizedLicenseValidation> {
    const res = await this.lsService.validateLicenseKey(key);
    const attrs = res.data.attributes;

    return {
      valid: attrs.status === 'active',
      status: attrs.status,
      activationLimit: attrs.activation_limit,
      activationUsage: attrs.instances_count,
    };
  }

  async activateLicenseKey(key: string, instanceName: string): Promise<NormalizedLicenseKey> {
    const res = await this.lsService.activateLicenseKey(key, instanceName);

    logger.info('License key activated', {
      'payment.provider': this.providerName,
      'payment.license_key_id': res.data.id,
    });

    return this.normalizeLicenseKey(res.data.id, res.data.attributes);
  }

  async deactivateLicenseKey(key: string, instanceId: string): Promise<void> {
    await this.lsService.deactivateLicenseKey(key, instanceId);

    logger.info('License key deactivated', {
      'payment.provider': this.providerName,
    });
  }

  // ========== Refunds ==========

  async refundOrder(externalOrderId: string, _amount?: number): Promise<{ success: boolean; refundId?: string }> {
    const res = await this.lsService.refundOrder(externalOrderId);

    logger.info('Order refunded', {
      'payment.provider': this.providerName,
      'payment.order_id': externalOrderId,
    });

    return {
      success: true,
      refundId: res.data.id,
    };
  }

  // ========== Webhook ==========

  parseWebhook(payload: unknown): NormalizedWebhookEvent {
    const webhookPayload = payload as WebhookPayload;
    const eventType = this.mapEventName(webhookPayload.meta.event_name);

    return {
      eventType,
      externalId: webhookPayload.data.id,
      data: webhookPayload.data.attributes,
      customData: webhookPayload.meta.custom_data,
      testMode: webhookPayload.meta.test_mode,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = this.config.lemonSqueezyWebhookSecret;
    const hmac = createHmac('sha256', secret);
    hmac.update(rawBody);
    const digest = hmac.digest('hex');

    // timing-safe comparison to prevent timing attacks
    const digestBuffer = Buffer.from(digest, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');

    if (digestBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(digestBuffer, signatureBuffer);
  }

  // ========== Store/Org ==========

  getStoreId(): string {
    return this.config.lemonSqueezyStoreId;
  }

  async getStoreCurrency(): Promise<string> {
    return this.lsService.getStoreCurrency();
  }

  // ========== Product/Variant Creation (Optional) ==========

  async createProduct(
    storeId: string,
    data: { name: string; description?: string },
  ): Promise<NormalizedProduct> {
    const res = await this.lsService.createProduct(storeId, data);

    logger.info('Product created', {
      'payment.provider': this.providerName,
      'payment.product_id': res.data.id,
      'payment.product_name': data.name,
    });

    return this.normalizeProduct(res.data.id, res.data.attributes);
  }

  async updateVariant(
    variantId: string,
    data: Record<string, unknown>,
  ): Promise<NormalizedVariant> {
    const res = await this.lsService.updateVariant(
      variantId,
      data as {
        name?: string;
        price?: number;
        is_subscription?: boolean;
        interval?: string;
        interval_count?: number;
      },
    );

    logger.info('Variant updated', {
      'payment.provider': this.providerName,
      'payment.variant_id': variantId,
    });

    return this.normalizeVariant(res.data.id, res.data.attributes);
  }

  // ========== Private Helpers ==========

  private normalizeProduct(id: string, attrs: LemonSqueezyProduct): NormalizedProduct {
    return {
      externalId: id,
      name: attrs.name,
      description: attrs.description || null,
      status: attrs.status,
      price: attrs.price / 100,
      currency: 'USD',
    };
  }

  private normalizeVariant(id: string, attrs: LemonSqueezyVariant): NormalizedVariant {
    return {
      externalId: id,
      productExternalId: String(attrs.product_id),
      name: attrs.name,
      price: attrs.price / 100,
      isSubscription: attrs.is_subscription,
      interval: attrs.interval,
      intervalCount: attrs.interval_count,
      hasLicenseKeys: attrs.has_license_keys,
      sort: attrs.sort,
    };
  }

  private normalizeSubscription(
    id: string,
    attrs: LemonSqueezySubscription,
  ): NormalizedSubscription {
    return {
      externalId: id,
      productExternalId: String(attrs.product_id),
      variantExternalId: String(attrs.variant_id),
      customerEmail: attrs.user_email,
      customerName: attrs.user_name || null,
      status: attrs.status as SubscriptionStatus,
      statusFormatted: attrs.status_formatted,
      price: attrs.first_subscription_item?.quantity ?? 0,
      currency: 'USD',
      interval: attrs.variant_name,
      renewsAt: attrs.renews_at,
      endsAt: attrs.ends_at,
      trialEndsAt: attrs.trial_ends_at,
      billingAnchor: attrs.billing_anchor,
      firstSubscriptionItemId: attrs.first_subscription_item
        ? String(attrs.first_subscription_item.id)
        : null,
      testMode: attrs.test_mode,
      urls: {
        updatePaymentMethod: attrs.urls.update_payment_method,
        customerPortal: attrs.urls.customer_portal,
      },
    };
  }

  private normalizeLicenseKey(id: string, attrs: LemonSqueezyLicenseKey): NormalizedLicenseKey {
    return {
      externalId: id,
      key: attrs.key,
      status: attrs.status,
      statusFormatted: attrs.status_formatted,
      activationLimit: attrs.activation_limit,
      activationUsage: attrs.instances_count,
      expiresAt: attrs.expires_at,
      testMode: attrs.test_mode,
    };
  }

  private mapEventName(lsEvent: WebhookEventName): NormalizedWebhookEventType {
    const mapping: Record<string, NormalizedWebhookEventType> = {
      subscription_created: 'subscription_created',
      subscription_updated: 'subscription_updated',
      subscription_cancelled: 'subscription_cancelled',
      subscription_expired: 'subscription_expired',
      subscription_paused: 'subscription_paused',
      subscription_resumed: 'subscription_resumed',
      subscription_unpaused: 'subscription_resumed',
      order_created: 'order_created',
      order_refunded: 'order_refunded',
      license_key_created: 'license_key_created',
      license_key_updated: 'license_key_updated',
    };

    const normalized = mapping[lsEvent];
    if (!normalized) {
      logger.warn('Unknown webhook event', {
        'payment.provider': this.providerName,
        'payment.event_name': lsEvent,
      });
      // 매핑되지 않는 이벤트는 subscription_updated로 폴백
      return 'subscription_updated';
    }

    return normalized;
  }
}
