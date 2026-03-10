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
} from '../types/normalized.types';

export interface PaymentProvider {
  readonly providerName: PaymentProviderName;

  // Products
  getProducts(): Promise<NormalizedProduct[]>;
  getProduct(id: string): Promise<NormalizedProduct>;

  // Variants
  getVariants(productId?: string): Promise<NormalizedVariant[]>;
  getVariantPriceModel(variantId: string): Promise<NormalizedPriceModel | null>;

  // Checkout
  createCheckout(data: NormalizedCheckoutInput): Promise<{ checkoutUrl: string }>;

  // Subscriptions
  getSubscription(externalId: string): Promise<NormalizedSubscription>;
  updateSubscription(externalId: string, data: Record<string, unknown>): Promise<NormalizedSubscription>;
  cancelSubscription(externalId: string): Promise<NormalizedSubscription>;

  // License Keys
  validateLicenseKey(key: string): Promise<NormalizedLicenseValidation>;
  activateLicenseKey(key: string, instanceName: string): Promise<NormalizedLicenseKey>;
  deactivateLicenseKey(key: string, instanceId: string): Promise<void>;

  // Refunds
  refundOrder(externalOrderId: string, amount?: number): Promise<{ success: boolean; refundId?: string }>;

  // Webhook
  parseWebhook(payload: unknown): NormalizedWebhookEvent;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;

  // Store/Org
  getStoreId(): string;
  getStoreCurrency(): Promise<string>;

  // Product/Variant creation (provider-specific, optional)
  createProduct?(storeId: string, data: { name: string; description?: string }): Promise<NormalizedProduct>;
  updateVariant?(variantId: string, data: Record<string, unknown>): Promise<NormalizedVariant>;
}
