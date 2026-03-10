// 결제 프로바이더 무관 공통 타입

export type PaymentProviderName = "lemon-squeezy" | "polar" | "inicis";

// --- Products ---
export interface NormalizedProduct {
  externalId: string;
  name: string;
  description: string | null;
  status: "draft" | "published";
  price: number;
  currency: string;
}

// --- Variants ---
export interface NormalizedVariant {
  externalId: string;
  productExternalId: string;
  name: string;
  price: number;
  isSubscription: boolean;
  interval: string | null;
  intervalCount: number | null;
  hasLicenseKeys: boolean;
  sort: number;
}

// --- PriceModel ---
export interface NormalizedPriceModelTier {
  lastUnit: number | string;
  unitPrice: number;
  fixedFee: number;
}

export interface NormalizedPriceModel {
  id: string;
  scheme: "standard" | "package" | "graduated" | "volume";
  unitPrice: number;
  renewalIntervalUnit: string | null;
  tiers: NormalizedPriceModelTier[] | null;
}

// --- Checkout ---
export interface NormalizedCheckoutInput {
  storeOrOrgId: string;
  variantOrProductId: string;
  customPrice?: number;
  email?: string;
  name?: string;
  discountCode?: string;
  customData?: Record<string, string>;
  redirectUrl?: string;
  testMode?: boolean;
}

// --- Subscription ---
export type SubscriptionStatus =
  | "on_trial"
  | "active"
  | "paused"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "expired";

export interface NormalizedSubscription {
  externalId: string;
  productExternalId: string;
  variantExternalId: string;
  customerEmail: string;
  customerName: string | null;
  status: SubscriptionStatus;
  statusFormatted: string;
  price: number;
  currency: string;
  interval: string;
  renewsAt: string;
  endsAt: string | null;
  trialEndsAt: string | null;
  billingAnchor: number | null;
  firstSubscriptionItemId: string | null;
  testMode: boolean;
  urls: {
    updatePaymentMethod?: string;
    customerPortal?: string;
  };
}

// --- Order ---
export interface NormalizedOrder {
  externalId: string;
  orderNumber: number;
  customerEmail: string;
  customerName: string | null;
  status: string;
  statusFormatted: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  testMode: boolean;
  urls: { receipt?: string };
}

// --- License ---
export interface NormalizedLicenseKey {
  externalId: string;
  key: string;
  status: string;
  statusFormatted: string;
  activationLimit: number | null;
  activationUsage: number;
  expiresAt: string | null;
  testMode: boolean;
}

export interface NormalizedLicenseValidation {
  valid: boolean;
  status: string;
  activationLimit: number | null;
  activationUsage: number;
}

// --- Webhook ---
export type NormalizedWebhookEventType =
  | "subscription_created"
  | "subscription_updated"
  | "subscription_cancelled"
  | "subscription_expired"
  | "subscription_paused"
  | "subscription_resumed"
  | "order_created"
  | "order_refunded"
  | "license_key_created"
  | "license_key_updated";

export interface NormalizedWebhookEvent {
  eventType: NormalizedWebhookEventType;
  externalId: string;
  data: unknown;
  customData?: Record<string, string>;
  testMode: boolean;
}
