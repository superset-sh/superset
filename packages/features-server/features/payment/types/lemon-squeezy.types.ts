/**
 * Lemon Squeezy API 응답 타입
 */

// 공통 타입
export interface LemonSqueezyResource<T> {
  type: string;
  id: string;
  attributes: T;
  relationships?: Record<string, unknown>;
  links?: {
    self: string;
  };
}

export interface LemonSqueezyResponse<T> {
  data: LemonSqueezyResource<T>;
}

export interface LemonSqueezyListResponse<T> {
  data: LemonSqueezyResource<T>[];
  meta: {
    page: {
      currentPage: number;
      from: number;
      lastPage: number;
      perPage: number;
      to: number;
      total: number;
    };
  };
  links: {
    first: string;
    last: string;
  };
}

// Product
export interface LemonSqueezyProduct {
  store_id: number;
  name: string;
  slug: string;
  description: string;
  status: 'draft' | 'published';
  status_formatted: string;
  thumb_url: string | null;
  large_thumb_url: string | null;
  price: number;
  price_formatted: string;
  from_price: number | null;
  to_price: number | null;
  pay_what_you_want: boolean;
  buy_now_url: string;
  from_price_formatted: string | null;
  to_price_formatted: string | null;
  created_at: string;
  updated_at: string;
}

// Variant (가격 옵션)
export interface LemonSqueezyVariant {
  product_id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  is_subscription: boolean;
  interval: 'day' | 'week' | 'month' | 'year' | null;
  interval_count: number | null;
  has_free_trial: boolean;
  trial_interval: string | null;
  trial_interval_count: number | null;
  pay_what_you_want: boolean;
  min_price: number;
  suggested_price: number;
  has_license_keys: boolean;
  license_activation_limit: number | null;
  is_license_limit_unlimited: boolean;
  license_length_value: number | null;
  license_length_unit: 'days' | 'months' | 'years' | null;
  is_license_length_unlimited: boolean;
  sort: number;
  status: 'pending' | 'draft' | 'published';
  status_formatted: string;
  created_at: string;
  updated_at: string;
}

// Price Model (Variant의 실제 가격 정보 — volume/graduated 등)
export interface LemonSqueezyPriceModelTier {
  last_unit: number | string; // 숫자 또는 "inf"
  unit_price: number;
  unit_price_decimal: string | null;
  fixed_fee: number;
}

export interface LemonSqueezyPriceModelAttributes {
  variant_id: number;
  category: 'one-time' | 'subscription' | 'lead_magnet' | 'pwyw';
  scheme: 'standard' | 'package' | 'graduated' | 'volume';
  usage_aggregation: string | null;
  unit_price: number;
  unit_price_decimal: string | null;
  setup_fee_enabled: boolean;
  setup_fee: number | null;
  package_size: number;
  tiers: LemonSqueezyPriceModelTier[] | null;
  renewal_interval_unit: string | null;
  renewal_interval_quantity: number | null;
  tax_code: string;
  created_at: string;
  updated_at: string;
}

export interface LemonSqueezyPriceModel {
  id: string;
  attributes: LemonSqueezyPriceModelAttributes;
}

// Subscription
export interface LemonSqueezySubscription {
  store_id: number;
  customer_id: number;
  order_id: number;
  order_item_id: number;
  product_id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  user_name: string;
  user_email: string;
  status: 'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired';
  status_formatted: string;
  card_brand: string | null;
  card_last_four: string | null;
  pause: {
    mode: 'void' | 'free' | null;
    resumes_at: string | null;
  } | null;
  cancelled: boolean;
  trial_ends_at: string | null;
  billing_anchor: number;
  first_subscription_item: {
    id: number;
    subscription_id: number;
    price_id: number;
    quantity: number;
    created_at: string;
    updated_at: string;
  };
  urls: {
    update_payment_method: string;
    customer_portal: string;
  };
  renews_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  test_mode: boolean;
}

// Order
export interface LemonSqueezyOrder {
  store_id: number;
  customer_id: number;
  identifier: string;
  order_number: number;
  user_name: string;
  user_email: string;
  currency: string;
  currency_rate: string;
  subtotal: number;
  discount_total: number;
  tax: number;
  total: number;
  subtotal_usd: number;
  discount_total_usd: number;
  tax_usd: number;
  total_usd: number;
  tax_name: string | null;
  tax_rate: string;
  status: 'pending' | 'paid' | 'refunded';
  status_formatted: string;
  refunded: boolean;
  refunded_at: string | null;
  subtotal_formatted: string;
  discount_total_formatted: string;
  tax_formatted: string;
  total_formatted: string;
  first_order_item: {
    id: number;
    order_id: number;
    product_id: number;
    variant_id: number;
    product_name: string;
    variant_name: string;
    price: number;
    created_at: string;
    updated_at: string;
  };
  urls: {
    receipt: string;
  };
  created_at: string;
  updated_at: string;
  test_mode: boolean;
}

// License Key
export interface LemonSqueezyLicenseKey {
  store_id: number;
  customer_id: number;
  order_id: number;
  order_item_id: number;
  product_id: number;
  user_name: string;
  user_email: string;
  key: string;
  key_short: string;
  activation_limit: number;
  instances_count: number;
  disabled: boolean;
  status: 'inactive' | 'active' | 'expired' | 'disabled';
  status_formatted: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  test_mode: boolean;
}

// Checkout
export interface CreateCheckoutData {
  store_id: string;
  variant_id: string;
  custom_price?: number;
  product_options?: {
    name?: string;
    description?: string;
    media?: string[];
    redirect_url?: string;
    receipt_button_text?: string;
    receipt_link_url?: string;
    receipt_thank_you_note?: string;
    enabled_variants?: string[];
  };
  checkout_options?: {
    embed?: boolean;
    media?: boolean;
    logo?: boolean;
    desc?: boolean;
    discount?: boolean;
    dark?: boolean;
    subscription_preview?: boolean;
    button_color?: string;
  };
  checkout_data?: {
    email?: string;
    name?: string;
    billing_address?: {
      country?: string;
      zip?: string;
    };
    tax_number?: string;
    discount_code?: string;
    custom?: Record<string, string>;
  };
  expires_at?: string;
  preview?: boolean;
  test_mode?: boolean;
}

export interface CheckoutResponse {
  data: {
    type: 'checkouts';
    id: string;
    attributes: {
      store_id: number;
      variant_id: number;
      custom_price: number | null;
      product_options: Record<string, unknown>;
      checkout_options: Record<string, unknown>;
      checkout_data: Record<string, unknown>;
      expires_at: string | null;
      created_at: string;
      updated_at: string;
      test_mode: boolean;
      url: string;
    };
  };
}

// Webhook 이벤트
export type WebhookEventName =
  | 'order_created'
  | 'order_refunded'
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_resumed'
  | 'subscription_expired'
  | 'subscription_paused'
  | 'subscription_unpaused'
  | 'subscription_payment_success'
  | 'subscription_payment_failed'
  | 'subscription_payment_recovered'
  | 'license_key_created'
  | 'license_key_updated';

export interface WebhookPayload<T = unknown> {
  meta: {
    event_name: WebhookEventName;
    custom_data?: Record<string, string>;
    test_mode: boolean;
  };
  data: LemonSqueezyResource<T>;
}
